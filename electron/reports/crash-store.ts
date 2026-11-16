import { rmSync } from 'node:fs'
import { open, readdir, readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { CrashRecord, DumpSummary } from '@/desktop/contract'
import { createSerialQueue } from '@/lib/serial-queue'
import { writeFileAtomic } from '../storage/file-queue'
import { readMinidump } from './minidump'

export const CRASH_ID_PATTERN = /^[\w.-]{1,128}$/

const CRASH_REASONS: ReadonlySet<string> = new Set([
  'crashed',
  'oom',
  'abnormal-exit',
  'launch-failed',
  'integrity-failure',
])

/** Returns true for a reason of `render-process-gone` or `child-process-gone` that means a crash. */
export function isCrashReason(reason: string): boolean {
  return CRASH_REASONS.has(reason)
}

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_EVENT_TO_DUMP_MS = 60_000
const MAX_EVENTS = 20
const MAX_EVENT_AGE_MS = 30 * DAY_MS
const MAX_DUMPS = 5
const MAX_DUMP_AGE_MS = 7 * DAY_MS
const MAX_DUMP_READ_BYTES = 64 * 1024 * 1024
const MAX_FOLDER_DEPTH = 3
const DUMP_SUFFIX = '.dmp'
// Crashpad writes a report in the folder "new" and moves it when the report is complete.
const UNFINISHED_FOLDER = 'new'
// Crashpad on Linux keeps the metadata of a report in a file with the same name and this suffix.
const METADATA_SUFFIX = '.meta'

const eventSchema = z.object({
  time: z.number(),
  process: z.string().max(64),
  reason: z.string().max(64),
  exitCode: z.number().int().nullable(),
})
type CrashEvent = z.infer<typeof eventSchema>

const logSchema = z.object({
  events: z.array(eventSchema).default([]),
  seen: z.array(z.string()).default([]),
  mainProcessDumps: z.array(z.string()).default([]),
})
type CrashLog = z.infer<typeof logSchema>

const sessionSchema = z.object({ startedAt: z.number() })

interface DumpFile {
  id: string
  file: string
  bytes: number
  modifiedAt: number
}

export interface CrashStoreOptions {
  /** The JSON file of the crash events of the app. */
  logFile: string
  /** The folder of the crash dumps of Electron. */
  dumpsFolder: string
  /** The file that exists while the app runs. */
  sessionFile: string
  now?: () => number
}

/** Returns the JSON value of a file, or `null` for a file that is missing or not JSON. */
export async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as unknown
  } catch {
    return null
  }
}

async function findDumps(folder: string, depth = 0): Promise<DumpFile[]> {
  if (depth > MAX_FOLDER_DEPTH) return []
  let entries
  try {
    entries = await readdir(folder, { withFileTypes: true })
  } catch {
    return []
  }
  const found: DumpFile[] = []
  for (const entry of entries) {
    const file = path.join(folder, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== UNFINISHED_FOLDER) found.push(...(await findDumps(file, depth + 1)))
      continue
    }
    if (!entry.isFile() || !entry.name.endsWith(DUMP_SUFFIX)) continue
    const id = entry.name.slice(0, -DUMP_SUFFIX.length)
    if (!CRASH_ID_PATTERN.test(id)) continue
    try {
      const info = await stat(file)
      found.push({ id, file, bytes: info.size, modifiedAt: info.mtimeMs })
    } catch {
      continue
    }
  }
  return found
}

async function summary(dump: DumpFile): Promise<DumpSummary> {
  const base = { bytes: dump.bytes, exception: '', location: '' }
  if (dump.bytes > MAX_DUMP_READ_BYTES) return base
  const handle = await open(dump.file, 'r').catch(() => null)
  if (!handle) return base
  try {
    const bytes = new Uint8Array(dump.bytes)
    await handle.read(bytes, 0, dump.bytes, 0)
    return { ...base, ...readMinidump(bytes) }
  } catch {
    return base
  } finally {
    await handle.close()
  }
}

function eventId(event: CrashEvent): string {
  return `event-${Math.round(event.time)}`
}

/**
 * Keeps the crashes of the desktop app on this computer: the crash events that the app records, and the crash dumps
 * that Electron writes. Each method deletes old crashes first, so that at most 5 dumps and 20 events stay.
 */
export function createCrashStore(options: CrashStoreOptions) {
  const now = options.now ?? Date.now
  const serial = createSerialQueue()

  const readLog = async (): Promise<CrashLog> => {
    const parsed = logSchema.safeParse(await readJson(options.logFile))
    return parsed.success ? parsed.data : { events: [], seen: [], mainProcessDumps: [] }
  }
  const writeLog = (log: CrashLog) => writeFileAtomic(options.logFile, JSON.stringify(log))

  const summaries = new Map<string, { bytes: number; modifiedAt: number; summary: DumpSummary }>()
  const summaryOf = async (dump: DumpFile): Promise<DumpSummary> => {
    const cached = summaries.get(dump.file)
    if (cached && cached.bytes === dump.bytes && cached.modifiedAt === dump.modifiedAt) return cached.summary
    const value = await summary(dump)
    summaries.set(dump.file, { bytes: dump.bytes, modifiedAt: dump.modifiedAt, summary: value })
    return value
  }

  const removeDump = async (dump: DumpFile) => {
    summaries.delete(dump.file)
    await rm(dump.file, { force: true })
    await rm(`${dump.file.slice(0, -DUMP_SUFFIX.length)}${METADATA_SUFFIX}`, { force: true })
  }

  const pruned = async (): Promise<{ log: CrashLog; dumps: DumpFile[] }> => {
    const log = await readLog()
    const time = now()
    const dumps = (await findDumps(options.dumpsFolder)).toSorted((a, b) => b.modifiedAt - a.modifiedAt)
    const kept = dumps.filter((dump, index) => index < MAX_DUMPS && time - dump.modifiedAt < MAX_DUMP_AGE_MS)
    for (const dump of dumps) if (!kept.includes(dump)) await removeDump(dump)
    const events = log.events
      .filter((event) => time - event.time < MAX_EVENT_AGE_MS)
      .toSorted((a, b) => b.time - a.time)
      .slice(0, MAX_EVENTS)
    const ids = new Set([...kept.map((dump) => dump.id), ...events.map(eventId)])
    const next: CrashLog = {
      events,
      seen: log.seen.filter((id) => ids.has(id)),
      mainProcessDumps: log.mainProcessDumps.filter((id) => ids.has(id)),
    }
    if (JSON.stringify(next) !== JSON.stringify(log)) await writeLog(next)
    return { log: next, dumps: kept }
  }

  const matches = (event: CrashEvent, dump: DumpFile) => Math.abs(event.time - dump.modifiedAt) <= MAX_EVENT_TO_DUMP_MS

  const pairs = (events: readonly CrashEvent[], dumps: readonly DumpFile[]) => {
    const unmatched = [...events]
    const eventOf = new Map<string, CrashEvent>()
    for (const dump of dumps) {
      const index = unmatched.findIndex((event) => matches(event, dump))
      if (index !== -1) eventOf.set(dump.id, unmatched.splice(index, 1)[0]!)
    }
    return { eventOf, unmatched }
  }

  const records = async (log: CrashLog, dumps: readonly DumpFile[]): Promise<CrashRecord[]> => {
    const { eventOf, unmatched } = pairs(log.events, dumps)
    const list: CrashRecord[] = []
    for (const dump of dumps) {
      const event = eventOf.get(dump.id)
      list.push({
        id: dump.id,
        time: event?.time ?? dump.modifiedAt,
        process: event?.process ?? (log.mainProcessDumps.includes(dump.id) ? 'main' : 'unknown'),
        reason: event?.reason ?? 'crashed',
        exitCode: event?.exitCode ?? null,
        dump: await summaryOf(dump),
        seen: log.seen.includes(dump.id) || (event !== undefined && log.seen.includes(eventId(event))),
      })
    }
    for (const event of unmatched) {
      const id = eventId(event)
      list.push({ id, ...event, dump: null, seen: log.seen.includes(id) })
    }
    return list.toSorted((a, b) => b.time - a.time)
  }

  return {
    /** Records a crash of a process that the app saw, and returns the kept crashes. */
    record: (event: Omit<CrashEvent, 'time'>) =>
      serial(async () => {
        const { log, dumps } = await pruned()
        const next = { ...log, events: [{ ...event, time: now() }, ...log.events].slice(0, MAX_EVENTS) }
        await writeLog(next)
        return records(next, dumps)
      }),

    /** Returns the kept crashes, the newest first. */
    list: () =>
      serial(async () => {
        const { log, dumps } = await pruned()
        return records(log, dumps)
      }),

    markSeen: () =>
      serial(async () => {
        const { log, dumps } = await pruned()
        const current = await records(log, dumps)
        await writeLog({ ...log, seen: current.map((crash) => crash.id) })
        return current.map((crash) => ({ ...crash, seen: true }))
      }),

    /** Returns the file of the crash dump of a crash, or `null` for a crash without a dump. */
    dumpFile: (id: string) => serial(async () => (await pruned()).dumps.find((dump) => dump.id === id)?.file ?? null),

    /** Deletes a crash, its event and its dump, and returns the kept crashes. */
    remove: (id: string) =>
      serial(async () => {
        const { log, dumps } = await pruned()
        const dump = dumps.find((candidate) => candidate.id === id)
        const removed = dump
          ? pairs(log.events, dumps).eventOf.get(dump.id)
          : log.events.find((event) => eventId(event) === id)
        const next = { ...log, events: log.events.filter((event) => event !== removed) }
        if (dump) await removeDump(dump)
        await writeLog(next)
        return records(
          next,
          dumps.filter((candidate) => candidate !== dump),
        )
      }),

    /**
     * Starts a session of the app. The dumps from a session that did not end, and that no event explains, are crashes
     * of the main process.
     */
    startSession: () =>
      serial(async () => {
        const previous = sessionSchema.safeParse(await readJson(options.sessionFile))
        if (previous.success) {
          const { log, dumps } = await pruned()
          const explained = (dump: DumpFile) => log.events.some((event) => matches(event, dump))
          const fromMain = dumps
            .filter((dump) => dump.modifiedAt >= previous.data.startedAt && !explained(dump))
            .map((dump) => dump.id)
          if (fromMain.length > 0) {
            await writeLog({ ...log, mainProcessDumps: [...new Set([...log.mainProcessDumps, ...fromMain])] })
          }
        }
        await writeFileAtomic(options.sessionFile, JSON.stringify({ startedAt: now() }))
      }),

    /** Ends the session of the app. It works while the app quits. */
    endSession: () => rmSync(options.sessionFile, { force: true }),
  }
}

export type CrashStore = ReturnType<typeof createCrashStore>
