import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { FileChange } from '@/desktop/contract'
import { errorMessage } from '@/lib/error-message'
import { writeThroughTemp } from './temp-files'

/** Delays before each retry of a rename that another process blocks. */
const RETRY_DELAYS_MS = [20, 50, 100, 200, 400]
const RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES'])

export function digest(text: string) {
  return createHash('sha256').update(text).digest('hex')
}

export function errorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : null
}

async function exists(file: string) {
  try {
    await stat(file)
    return true
  } catch (error) {
    return errorCode(error) !== 'ENOENT'
  }
}

async function withRetry<T>(work: () => Promise<T>): Promise<T> {
  for (const delayMs of RETRY_DELAYS_MS) {
    try {
      return await work()
    } catch (error) {
      if (!RETRY_CODES.has(errorCode(error) ?? '')) throw error
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  return work()
}

/**
 * Writes a whole file at once: to a temporary file next to it, then a rename. The rename tries again for a short time
 * while another process locks the file.
 */
export async function writeFileAtomic(file: string, data: string | Uint8Array, mode = 0o600) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeThroughTemp(file, async (temp) => {
    await writeFile(temp, data, { mode })
    await withRetry(() => rename(temp, file))
  })
}

/** Tells that the trash did not take a file. The file stays where it is. */
export class TrashError extends Error {}

async function removeFile(file: string, trash: ((file: string) => Promise<void>) | undefined) {
  try {
    await (trash ? trash(file) : unlink(file))
  } catch (error) {
    if (errorCode(error) === 'ENOENT' || !(await exists(file))) return
    throw trash ? new TrashError(errorMessage(error), { cause: error }) : error
  }
}

interface KnownFile {
  digest: string
  size: number
  mtimeMs: number
}

export interface FileQueueOptions {
  /** Returns the file of an id. */
  pathOf: (id: string) => string
  /** Returns true if the id may name a file. */
  accepts: (id: string) => boolean
  /** Makes sure that a file can be written. The queue calls it again after a write fails because a folder is gone. */
  prepare: (file: string, retry: boolean) => Promise<void>
  /** Moves a file to the trash. If it fails and the file stays, the remove fails with a {@link TrashError}. */
  trash?: (file: string) => Promise<void>
}

export type FileQueue = ReturnType<typeof createFileQueue>

export interface WriteOptions {
  /** If true, the write replaces the file also after a change from outside, for example after a save dialog. */
  replace?: boolean
}

/**
 * Writes and removes files one change at a time for each id.
 *
 * Writes are atomic. Each id keeps only its last change that is not written yet. {@link FileQueue.inspect} compares
 * each file with the digest, size and change time of the last read, write or remove that succeeded. A write that fails
 * does not change these values. The size and change time of a read come from before the read, and those of a write
 * from the temporary file before its rename. Thus a change from outside during a read or just after a write is not
 * lost.
 *
 * Just before the rename, a write compares the file with these values. A file that changed from outside since then
 * stays, and the write gives that change.
 */
export function createFileQueue(options: FileQueueOptions) {
  const known = new Map<string, KnownFile>()
  const sequence = new Map<string, number>()
  const chains = new Map<string, Promise<unknown>>()

  const read = async (id: string) => {
    const file = options.pathOf(id)
    const before = sequence.get(id)
    const info = await stat(file)
    const text = await readFile(file, 'utf8')
    if (sequence.get(id) === before) known.set(id, { digest: digest(text), size: info.size, mtimeMs: info.mtimeMs })
    return text
  }

  async function changeFromOutside(id: string, target: string): Promise<{ text: string; file: KnownFile } | null> {
    const current = known.get(id)
    if (!current) return null
    try {
      const info = await stat(target)
      if (info.size === current.size && info.mtimeMs === current.mtimeMs) return null
      const text = await readFile(target, 'utf8')
      const hash = digest(text)
      return hash === current.digest ? null : { text, file: { digest: hash, size: info.size, mtimeMs: info.mtimeMs } }
    } catch {
      return null
    }
  }

  async function writeTemp(target: string, temp: string, text: string) {
    await options.prepare(target, false)
    try {
      await writeFile(temp, text, 'utf8')
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error
      await options.prepare(target, true)
      await writeFile(temp, text, 'utf8')
    }
  }

  async function remove(id: string, trash: boolean) {
    await removeFile(options.pathOf(id), trash ? options.trash : undefined)
    known.delete(id)
  }

  async function write(id: string, text: string, { replace = false }: WriteOptions): Promise<FileChange | null> {
    const target = options.pathOf(id)
    let kept: FileChange | null = null
    await writeThroughTemp(target, async (temp) => {
      await writeTemp(target, temp, text)
      const written = await stat(temp)
      const outside = replace ? null : await changeFromOutside(id, target)
      if (outside) {
        await rm(temp, { force: true }).catch(() => undefined)
        known.set(id, outside.file)
        kept = { kind: 'changed', id, text: outside.text }
        return
      }
      await withRetry(() => rename(temp, target))
      known.set(id, { digest: digest(text), size: written.size, mtimeMs: written.mtimeMs })
    })
    return kept
  }

  function enqueue<T>(id: string, perform: () => Promise<T>): Promise<T | undefined> {
    if (!options.accepts(id)) return Promise.reject(new Error(`"${id}" is not a valid diagram id.`))
    const seq = (sequence.get(id) ?? 0) + 1
    sequence.set(id, seq)
    const previous = chains.get(id) ?? Promise.resolve()
    const run = previous.catch(() => undefined).then(() => (sequence.get(id) === seq ? perform() : undefined))
    chains.set(id, run)
    void run
      .catch(() => undefined)
      .then(() => {
        if (chains.get(id) === run) chains.delete(id)
      })
    return run
  }

  /**
   * Checks one file again and compares it with what this app knows of it. A file with the known size and change time
   * counts as unchanged without a read.
   *
   * @returns The change, or `null` if the file is as this app wrote it. The result is also `null` if this app starts a
   *   write or remove of the file during the check. The file watcher reports that write. A later call checks the file
   *   again.
   */
  async function inspect(id: string): Promise<FileChange | null> {
    await chains.get(id)?.catch(() => undefined)
    const before = sequence.get(id)
    const current = known.get(id)
    const file = options.pathOf(id)
    let text: string
    try {
      const info = await stat(file)
      if (current && info.size === current.size && info.mtimeMs === current.mtimeMs) return null
      text = await readFile(file, 'utf8')
      if (sequence.get(id) !== before) return null
      const hash = digest(text)
      known.set(id, { digest: hash, size: info.size, mtimeMs: info.mtimeMs })
      if (current?.digest === hash) return null
    } catch (error) {
      if (sequence.get(id) !== before || errorCode(error) !== 'ENOENT' || !known.has(id)) return null
      known.delete(id)
      return { kind: 'removed', id }
    }
    return { kind: 'changed', id, text }
  }

  return {
    /**
     * Reads a file and takes its content, size and change time as the known state, unless this app starts a write or
     * remove of the file during the read.
     */
    read,
    knows: (id: string) => known.has(id),
    forget: (id: string) => known.delete(id),
    /**
     * Writes a file, unless it changed from outside since the last read or write.
     *
     * @returns The change from outside that the file keeps, or `null` after the write or after a later write of the
     *   same id took its place.
     */
    write: async (id: string, text: string, writeOptions: WriteOptions = {}): Promise<FileChange | null> =>
      (await enqueue(id, () => write(id, text, writeOptions))) ?? null,
    remove: async (id: string, trash: boolean): Promise<void> => {
      await enqueue(id, () => remove(id, trash))
    },
    inspect,
    /** Returns the ids of the files that the queue knows. */
    knownIds: () => [...known.keys()],
    /** Resolves when all queued writes and removes end. */
    drain: async () => {
      await Promise.all([...chains.values()].map((chain) => chain.catch(() => undefined)))
    },
  }
}
