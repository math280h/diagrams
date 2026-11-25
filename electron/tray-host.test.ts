import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrayHost } from '@/desktop/contract'
import {
  createTrayHostWatch,
  findTrayHost,
  OWNER_QUERIES,
  parseDbusSendReply,
  parseGdbusReply,
  remakesTrayIcon,
  STATUS_NOTIFIER_WATCHER,
  type RunProgram,
} from './tray-host'

const DBUS_SEND_TRUE = [
  'method return time=1764000000.123456 sender=org.freedesktop.DBus -> destination=:1.92 serial=3 reply_serial=2',
  '   boolean true',
  '',
].join('\n')

function missingProgram(command: string): Error {
  return Object.assign(new Error(`spawn ${command} ENOENT`), { code: 'ENOENT' })
}

describe('parseGdbusReply', () => {
  it('reads the boolean of the reply', () => {
    expect(parseGdbusReply('(true,)\n')).toBe(true)
    expect(parseGdbusReply('(false,)\n')).toBe(false)
    expect(parseGdbusReply('( true , )')).toBe(true)
  })

  it('gives null for other output', () => {
    expect(parseGdbusReply('')).toBeNull()
    expect(parseGdbusReply("('true',)")).toBeNull()
    expect(parseGdbusReply('(true, false)')).toBeNull()
    expect(parseGdbusReply('Error connecting: Could not connect: No such file or directory')).toBeNull()
  })
})

describe('parseDbusSendReply', () => {
  it('reads the boolean line of the reply', () => {
    expect(parseDbusSendReply(DBUS_SEND_TRUE)).toBe(true)
    expect(parseDbusSendReply(DBUS_SEND_TRUE.replace('boolean true', 'boolean false'))).toBe(false)
  })

  it('gives null for other output', () => {
    expect(parseDbusSendReply('')).toBeNull()
    expect(parseDbusSendReply('   string "true"')).toBeNull()
    expect(parseDbusSendReply('Error org.freedesktop.DBus.Error.ServiceUnknown: no such name')).toBeNull()
  })
})

describe('OWNER_QUERIES', () => {
  it('asks the session bus for the owner of the watcher name, first with gdbus, then with dbus-send', () => {
    expect(OWNER_QUERIES.map((query) => query.command)).toEqual(['gdbus', 'dbus-send'])
    for (const query of OWNER_QUERIES) {
      expect(query.args).toContain('--session')
      expect(query.args.some((arg) => arg.endsWith('org.freedesktop.DBus.NameHasOwner'))).toBe(true)
      expect(query.args.at(-1)?.endsWith(STATUS_NOTIFIER_WATCHER)).toBe(true)
    }
    expect(STATUS_NOTIFIER_WATCHER).toBe('org.kde.StatusNotifierWatcher')
  })
})

describe('findTrayHost', () => {
  it('does not ask on Windows and macOS', async () => {
    const run = vi.fn<RunProgram>()
    expect(await findTrayHost('win32', run)).toBe('present')
    expect(await findTrayHost('darwin', run)).toBe('present')
    expect(run).not.toHaveBeenCalled()
  })

  it('finds a tray host or its absence with gdbus', async () => {
    expect(await findTrayHost('linux', async () => '(true,)\n')).toBe('present')
    const run = vi.fn<RunProgram>(async () => '(false,)\n')
    expect(await findTrayHost('linux', run)).toBe('missing')
    expect(run).toHaveBeenCalledTimes(1)
    expect(run.mock.calls[0]![0]).toBe('gdbus')
  })

  it('uses dbus-send when gdbus is missing', async () => {
    const run = vi.fn<RunProgram>(async (command) => {
      if (command === 'gdbus') throw missingProgram(command)
      return DBUS_SEND_TRUE.replace('boolean true', 'boolean false')
    })
    expect(await findTrayHost('linux', run)).toBe('missing')
    expect(run.mock.calls.map(([command]) => command)).toEqual(['gdbus', 'dbus-send'])
  })

  it('uses dbus-send when gdbus gives output that the app cannot read', async () => {
    const run: RunProgram = async (command) => (command === 'gdbus' ? 'unexpected' : DBUS_SEND_TRUE)
    expect(await findTrayHost('linux', run)).toBe('present')
  })

  it('gives unknown without both programs, or when the session bus does not answer', async () => {
    expect(
      await findTrayHost('linux', async (command) => {
        throw missingProgram(command)
      }),
    ).toBe('unknown')
    expect(
      await findTrayHost('linux', async () => {
        throw new Error('Command failed: Could not connect: No such file or directory')
      }),
    ).toBe('unknown')
  })
})

describe('remakesTrayIcon', () => {
  it('makes the icon again only when a host starts', () => {
    expect(remakesTrayIcon('missing', 'present')).toBe(true)
    expect(remakesTrayIcon('unknown', 'present')).toBe(true)
    expect(remakesTrayIcon('present', 'present')).toBe(false)
    expect(remakesTrayIcon('present', 'missing')).toBe(false)
    expect(remakesTrayIcon('missing', 'unknown')).toBe(false)
  })
})

describe('createTrayHostWatch', () => {
  const RECHECK_MS = 1000

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function watchWith(answers: TrayHost[]) {
    const find = vi.fn(async (): Promise<TrayHost> => answers.shift() ?? 'missing')
    const changed = vi.fn()
    const watch = createTrayHostWatch({ platform: 'linux', find, changed, recheckMs: RECHECK_MS })
    return { watch, find, changed }
  }

  it('starts with unknown on Linux and with present elsewhere', () => {
    expect(createTrayHostWatch({ platform: 'linux', changed: vi.fn() }).current()).toBe('unknown')
    expect(createTrayHostWatch({ platform: 'win32', changed: vi.fn() }).current()).toBe('present')
  })

  it('keeps the last answer and reports each change', async () => {
    const { watch, changed } = watchWith(['missing', 'missing', 'present'])
    expect(await watch.refresh()).toBe('missing')
    expect(changed).toHaveBeenLastCalledWith('missing', 'unknown')
    await watch.refresh()
    expect(changed).toHaveBeenCalledTimes(1)
    expect(await watch.refresh()).toBe('present')
    expect(watch.current()).toBe('present')
    expect(changed).toHaveBeenLastCalledWith('present', 'missing')
  })

  it('shares one question between calls at the same time', async () => {
    const { watch, find } = watchWith(['present'])
    const [first, second] = await Promise.all([watch.refresh(), watch.refresh()])
    expect([first, second]).toEqual(['present', 'present'])
    expect(find).toHaveBeenCalledTimes(1)
  })

  it('asks again while watched and without a host, and stops when a host starts', async () => {
    const { watch, find, changed } = watchWith(['missing', 'missing', 'present'])
    await watch.refresh()
    watch.watch(true)
    await vi.advanceTimersByTimeAsync(RECHECK_MS)
    expect(find).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(RECHECK_MS)
    expect(find).toHaveBeenCalledTimes(3)
    expect(changed).toHaveBeenLastCalledWith('present', 'missing')
    await vi.advanceTimersByTimeAsync(RECHECK_MS * 5)
    expect(find).toHaveBeenCalledTimes(3)
  })

  it('does not ask again when not watched, for an unknown answer, or after a stop', async () => {
    const notWatched = watchWith(['missing'])
    await notWatched.watch.refresh()
    await vi.advanceTimersByTimeAsync(RECHECK_MS * 3)
    expect(notWatched.find).toHaveBeenCalledTimes(1)

    const unknown = watchWith(['unknown'])
    unknown.watch.watch(true)
    await unknown.watch.refresh()
    await vi.advanceTimersByTimeAsync(RECHECK_MS * 3)
    expect(unknown.find).toHaveBeenCalledTimes(1)

    const stopped = watchWith(['missing'])
    stopped.watch.watch(true)
    await stopped.watch.refresh()
    stopped.watch.stop()
    await vi.advanceTimersByTimeAsync(RECHECK_MS * 3)
    expect(stopped.find).toHaveBeenCalledTimes(1)

    const off = watchWith(['missing'])
    off.watch.watch(true)
    await off.watch.refresh()
    off.watch.watch(false)
    await vi.advanceTimersByTimeAsync(RECHECK_MS * 3)
    expect(off.find).toHaveBeenCalledTimes(1)
  })

  it('gives unknown when the question fails', async () => {
    const changed = vi.fn()
    const watch = createTrayHostWatch({
      platform: 'linux',
      find: async () => {
        throw new Error('The question failed.')
      },
      changed,
    })
    expect(await watch.refresh()).toBe('unknown')
    expect(changed).not.toHaveBeenCalled()
  })
})
