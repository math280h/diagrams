import { execFile } from 'node:child_process'
import type { TrayHost } from '@/desktop/contract'

export const STATUS_NOTIFIER_WATCHER = 'org.kde.StatusNotifierWatcher'
/** How often the app asks the bus again while it runs in the background and no tray host exists. */
export const TRAY_HOST_RECHECK_MS = 30_000
const QUERY_TIMEOUT_MS = 2000

/** Runs a program and gives its standard output. The promise rejects when the program is missing or fails. */
export type RunProgram = (command: string, args: readonly string[]) => Promise<string>

interface OwnerQuery {
  command: string
  args: readonly string[]
  /** Returns the answer of the bus, or `null` for output that the app cannot read. */
  parse: (stdout: string) => boolean | null
}

/** Reads the reply of `gdbus call` to `NameHasOwner`, for example `(true,)`. */
export function parseGdbusReply(stdout: string): boolean | null {
  const match = /^\(\s*(true|false)\s*,\s*\)$/.exec(stdout.trim())
  return match ? match[1] === 'true' : null
}

/** Reads the reply of `dbus-send --print-reply` to `NameHasOwner`, for example a line `boolean true`. */
export function parseDbusSendReply(stdout: string): boolean | null {
  const match = /^\s*boolean (true|false)\s*$/m.exec(stdout)
  return match ? match[1] === 'true' : null
}

/** The programs that ask the session bus if a tray host exists, in the order that the app tries them. */
export const OWNER_QUERIES: readonly OwnerQuery[] = [
  {
    command: 'gdbus',
    args: [
      'call',
      '--session',
      '--dest',
      'org.freedesktop.DBus',
      '--object-path',
      '/org/freedesktop/DBus',
      '--method',
      'org.freedesktop.DBus.NameHasOwner',
      STATUS_NOTIFIER_WATCHER,
    ],
    parse: parseGdbusReply,
  },
  {
    command: 'dbus-send',
    args: [
      '--session',
      '--print-reply',
      '--dest=org.freedesktop.DBus',
      '/org/freedesktop/DBus',
      'org.freedesktop.DBus.NameHasOwner',
      `string:${STATUS_NOTIFIER_WATCHER}`,
    ],
    parse: parseDbusSendReply,
  },
]

const runProgram: RunProgram = (command, args) =>
  new Promise((resolve, reject) => {
    execFile(command, args, { timeout: QUERY_TIMEOUT_MS, encoding: 'utf8' }, (error, stdout) =>
      error ? reject(error) : resolve(stdout),
    )
  })

/**
 * Asks the session bus if a tray host exists. It tries each program of {@link OWNER_QUERIES} until one answers.
 *
 * @param platform - A Node `process.platform` value. Only Linux asks the bus.
 * @returns `unknown` when no program answers, for example without `gdbus` and `dbus-send` or without a session bus.
 */
export async function findTrayHost(platform: string, run: RunProgram = runProgram): Promise<TrayHost> {
  if (platform !== 'linux') return 'present'
  for (const query of OWNER_QUERIES) {
    const owned = await run(query.command, query.args).then(query.parse, () => null)
    if (owned !== null) return owned ? 'present' : 'missing'
  }
  return 'unknown'
}

/** Tells whether the app makes its tray icon again when the tray host changes from `previous` to `next`. */
export function remakesTrayIcon(previous: TrayHost, next: TrayHost): boolean {
  return previous !== 'present' && next === 'present'
}

export interface TrayHostWatch {
  current(): TrayHost
  /** Asks the bus again. Calls at the same time share one question. */
  refresh(): Promise<TrayHost>
  /**
   * Starts or stops the questions every {@link TRAY_HOST_RECHECK_MS}. They run only while `watched` is true and the last
   * answer is `missing`.
   */
  watch(watched: boolean): void
  stop(): void
}

/**
 * Keeps the last answer of {@link findTrayHost}.
 *
 * @param changed - Runs when the answer changes.
 */
export function createTrayHostWatch({
  platform,
  find = () => findTrayHost(platform),
  changed,
  recheckMs = TRAY_HOST_RECHECK_MS,
}: {
  platform: string
  find?: () => Promise<TrayHost>
  changed: (next: TrayHost, previous: TrayHost) => void
  recheckMs?: number
}): TrayHostWatch {
  let host: TrayHost = platform === 'linux' ? 'unknown' : 'present'
  let watched = false
  let asking: Promise<TrayHost> | null = null
  let timer: NodeJS.Timeout | undefined

  const schedule = () => {
    clearTimeout(timer)
    timer = undefined
    if (!watched || host !== 'missing') return
    timer = setTimeout(() => void refresh(), recheckMs)
    timer.unref()
  }

  const ask = async () => {
    const next = await find().catch((): TrayHost => 'unknown')
    const previous = host
    host = next
    if (next !== previous) changed(next, previous)
    schedule()
    return next
  }

  const refresh = () => {
    asking ??= ask().finally(() => {
      asking = null
    })
    return asking
  }

  return {
    current: () => host,
    refresh,
    watch(next) {
      watched = next
      schedule()
    },
    stop() {
      watched = false
      schedule()
    },
  }
}
