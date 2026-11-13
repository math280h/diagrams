import { EventEmitter } from 'node:events'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  watch,
  writeFileSync,
  type FSWatcher,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createThemeFiles, watchThemeFolder } from './theme-files'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, watch: vi.fn() }
})

const DEBOUNCE_MS = 150
const RESTART_DELAY_MS = 1000
const PROBE_INTERVAL_MS = 100
const CHANGE_TIME_STEP_MS = 50
const KEPT_FILE_TIME = new Date('2026-01-01T00:00:00Z')
const SYSTEM_WATCH_TIMEOUT_MS = 15_000

type Listener = (event: 'rename' | 'change', name: string | null) => void

interface FakeWatcher {
  folder: string
  emit: Listener
  fail: () => void
  close: ReturnType<typeof vi.fn>
}

let folder: string
let watchers: FakeWatcher[] = []

// fs.watch throws ENOENT for a folder that does not exist.
function fakeWatch(target: string, listener: Listener): FSWatcher {
  if (!existsSync(target)) {
    throw Object.assign(new Error(`ENOENT: no such file or directory, watch '${target}'`), { code: 'ENOENT' })
  }
  const emitter = new EventEmitter()
  const close = vi.fn()
  watchers.push({ folder: target, emit: listener, fail: () => emitter.emit('error', new Error('Gone.')), close })
  return Object.assign(emitter, { close }) as unknown as FSWatcher
}

async function reported(onChange: ReturnType<typeof vi.fn>, times: number) {
  vi.advanceTimersByTime(DEBOUNCE_MS)
  await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(times))
}

function watcherOf(target: string): FakeWatcher | undefined {
  return watchers.findLast((watcher) => watcher.folder === target)
}

async function startWatch() {
  const files = createThemeFiles(folder)
  const onChange = vi.fn()
  const watcher = watchThemeFolder(files, onChange)
  await watcher.rescan()
  return { themes: files.folder, onChange, watcher }
}

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'dg-themes-'))
})

afterEach(() => {
  rmSync(folder, { recursive: true, force: true })
})

describe('theme files', () => {
  it('lists no themes when the diagrams folder has no themes folder', async () => {
    expect(await createThemeFiles(folder).list()).toEqual([])
  })

  it('reads the theme files of the themes folder and leaves other files out', async () => {
    const themes = path.join(folder, 'themes')
    mkdirSync(themes)
    writeFileSync(path.join(themes, 'brand.theme.json'), '{"name":"Brand","base":"dark"}')
    writeFileSync(path.join(themes, 'notes.txt'), 'not a theme')
    writeFileSync(path.join(themes, 'huge.theme.json'), 'x'.repeat(300 * 1024))
    expect(await createThemeFiles(folder).list()).toEqual([{ name: 'brand', text: '{"name":"Brand","base":"dark"}' }])
  })

  it('writes a new theme file, and does not replace a file with the same name', async () => {
    const files = createThemeFiles(folder)
    await files.write({ name: 'brand', text: 'first' })
    expect(readFileSync(path.join(folder, 'themes', 'brand.theme.json'), 'utf8')).toBe('first')
    await expect(files.write({ name: 'brand', text: 'second' })).rejects.toThrow()
    await expect(files.write({ name: '../escape', text: 'x' })).rejects.toThrow('small letters')
    expect(readFileSync(path.join(folder, 'themes', 'brand.theme.json'), 'utf8')).toBe('first')
  })

  it('gives a new signature when a theme file changes, also with the same size and an old modification time', async () => {
    const files = createThemeFiles(folder)
    expect(await files.signature()).toBe('')
    await files.write({ name: 'brand', text: '{"a":1}' })
    const file = path.join(files.folder, 'brand.theme.json')
    writeFileSync(path.join(files.folder, 'notes.txt'), 'not a theme')
    utimesSync(file, KEPT_FILE_TIME, KEPT_FILE_TIME)
    const first = await files.signature()
    expect(first).toMatch(/^brand\.theme\.json:/)

    await new Promise((resolve) => setTimeout(resolve, CHANGE_TIME_STEP_MS))
    writeFileSync(file, '{"a":2}')
    utimesSync(file, KEPT_FILE_TIME, KEPT_FILE_TIME)
    expect(statSync(file).mtimeMs).toBe(KEPT_FILE_TIME.getTime())
    expect(await files.signature()).not.toBe(first)
  })
})

describe('watchThemeFolder', () => {
  beforeEach(() => {
    watchers = []
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.mocked(watch).mockImplementation(fakeWatch as unknown as typeof watch)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.mocked(watch).mockReset()
  })

  it('watches a themes folder that appears after the watch starts, and reports a burst of changes once', async () => {
    const { themes, onChange, watcher } = await startWatch()
    expect(watchers.map((item) => item.folder)).toEqual([folder])

    mkdirSync(themes)
    watcherOf(folder)!.emit('rename', 'themes')
    await reported(onChange, 1)

    writeFileSync(path.join(themes, 'brand.theme.json'), '{}')
    watcherOf(themes)!.emit('rename', 'brand.theme.json')
    watcherOf(themes)!.emit('change', 'brand.theme.json')
    watcherOf(themes)!.emit('change', 'brand.theme.json')
    await reported(onChange, 2)
    expect(vi.getTimerCount()).toBe(0)

    watcherOf(themes)!.emit('change', '.DS_Store')
    watcherOf(themes)!.emit('rename', 'brand.theme.json.swp')
    expect(vi.getTimerCount()).toBe(0)
    watcher.stop()
  })

  it('ignores other files of the diagrams folder, and keeps the watcher when the themes folder only changes', async () => {
    const themes = path.join(folder, 'themes')
    mkdirSync(themes)
    const { onChange, watcher } = await startWatch()
    watcherOf(folder)!.emit('rename', 'd_one.diagram.json')
    expect(vi.getTimerCount()).toBe(0)

    const first = watcherOf(themes)!
    watcherOf(folder)!.emit('change', 'themes')
    expect(watcherOf(themes)).toBe(first)
    expect(first.close).not.toHaveBeenCalled()
    await reported(onChange, 1)
    watcher.stop()
  })

  it('watches the new folder when another program replaces the themes folder', async () => {
    const themes = path.join(folder, 'themes')
    mkdirSync(themes)
    const { onChange, watcher } = await startWatch()
    const first = watcherOf(themes)!
    rmSync(themes, { recursive: true })
    mkdirSync(themes)
    watcherOf(folder)!.emit('rename', 'themes')
    expect(first.close).toHaveBeenCalled()
    expect(watcherOf(themes)).not.toBe(first)
    await reported(onChange, 1)
    watcher.stop()
  })

  it('reports a failed theme watcher, and watches the folder again when it comes back', async () => {
    const themes = path.join(folder, 'themes')
    mkdirSync(themes)
    const { onChange, watcher } = await startWatch()
    const first = watcherOf(themes)!
    rmSync(themes, { recursive: true })
    first.fail()
    expect(first.close).toHaveBeenCalled()
    await reported(onChange, 1)

    mkdirSync(themes)
    watcherOf(folder)!.emit('rename', 'themes')
    expect(watcherOf(themes)).not.toBe(first)
    await reported(onChange, 2)
    watcher.stop()
  })

  it('starts a failed theme watcher again while the themes folder stays', async () => {
    const themes = path.join(folder, 'themes')
    mkdirSync(themes)
    const { onChange, watcher } = await startWatch()
    const first = watcherOf(themes)!
    first.fail()
    await reported(onChange, 1)

    vi.advanceTimersByTime(RESTART_DELAY_MS)
    await vi.waitFor(() => expect(watcherOf(themes)).not.toBe(first))
    watcherOf(themes)!.emit('change', 'brand.theme.json')
    await reported(onChange, 2)
    watcher.stop()
  })

  it('keeps a working theme watcher when a rescan comes while a report is due', async () => {
    const themes = path.join(folder, 'themes')
    mkdirSync(themes)
    const { onChange, watcher } = await startWatch()
    const first = watcherOf(themes)!
    writeFileSync(path.join(themes, 'brand.theme.json'), '{}')
    first.emit('rename', 'brand.theme.json')
    await watcher.rescan()
    expect(first.close).not.toHaveBeenCalled()
    await reported(onChange, 1)
    await watcher.rescan()
    expect(first.close).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    watcher.stop()
  })

  it('catches up at a rescan with a themes folder and a theme file that came without an event', async () => {
    const { themes, onChange, watcher } = await startWatch()
    await watcher.rescan()
    expect(vi.getTimerCount()).toBe(0)

    mkdirSync(themes)
    await watcher.rescan()
    const first = watcherOf(themes)!
    expect(first).toBeDefined()
    expect(vi.getTimerCount()).toBe(0)

    writeFileSync(path.join(themes, 'brand.theme.json'), '{}')
    await watcher.rescan()
    expect(first.close).toHaveBeenCalled()
    expect(watcherOf(themes)).not.toBe(first)
    await reported(onChange, 1)

    await watcher.rescan()
    expect(vi.getTimerCount()).toBe(0)
    watcher.stop()
  })

  it('starts the watcher of the diagrams folder again after an error, and catches up', async () => {
    const { themes, onChange, watcher } = await startWatch()
    const parent = watcherOf(folder)!
    parent.fail()
    expect(parent.close).toHaveBeenCalled()
    mkdirSync(themes)
    writeFileSync(path.join(themes, 'brand.theme.json'), '{}')

    vi.advanceTimersByTime(RESTART_DELAY_MS)
    expect(watcherOf(folder)).not.toBe(parent)
    await vi.waitFor(() => expect(watcherOf(themes)).toBeDefined())
    await reported(onChange, 1)
    watcher.stop()
  })

  it('tries the diagrams folder again until it exists, and then catches up', async () => {
    rmSync(folder, { recursive: true })
    const { themes, onChange, watcher } = await startWatch()
    expect(watchers).toEqual([])
    vi.advanceTimersByTime(RESTART_DELAY_MS)
    expect(watchers).toEqual([])

    mkdirSync(themes, { recursive: true })
    writeFileSync(path.join(themes, 'brand.theme.json'), '{}')
    vi.advanceTimersByTime(RESTART_DELAY_MS)
    expect(watcherOf(folder)).toBeDefined()
    await vi.waitFor(() => expect(watcherOf(themes)).toBeDefined())
    await reported(onChange, 1)
    watcher.stop()
  })

  it('stops both watchers, a due report, later rescans and restarts', async () => {
    const themes = path.join(folder, 'themes')
    mkdirSync(themes)
    const { onChange, watcher } = await startWatch()
    watcherOf(themes)!.emit('change', 'brand.theme.json')
    watcher.stop()
    writeFileSync(path.join(themes, 'brand.theme.json'), '{}')
    await watcher.rescan()
    watcherOf(folder)!.fail()
    watcherOf(themes)!.fail()
    expect(vi.getTimerCount()).toBe(0)
    expect(onChange).not.toHaveBeenCalled()
    expect(watcherOf(themes)!.close).toHaveBeenCalled()
    expect(watcherOf(folder)!.close).toHaveBeenCalled()
    expect(watchers).toHaveLength(2)
  })
})

describe('watchThemeFolder with the file watcher of the system', () => {
  const seen = new Set<string>()

  beforeEach(async () => {
    seen.clear()
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
    const recordingWatch = (target: string, listener: Listener) =>
      actual.watch(target, (event, name) => {
        if (name) seen.add(name)
        listener(event, name)
      })
    vi.mocked(watch).mockImplementation(recordingWatch as unknown as typeof watch)
  })

  afterEach(() => {
    vi.mocked(watch).mockReset()
  })

  // On macOS, fs.watch starts FSEvents asynchronously, so it can miss the changes of its first milliseconds.
  async function untilWatching(target: string) {
    for (let probe = 0; ![...seen].some((name) => name.startsWith('probe-')); probe += 1) {
      writeFileSync(path.join(target, `probe-${probe}.txt`), '')
      await new Promise((resolve) => setTimeout(resolve, PROBE_INTERVAL_MS))
    }
  }

  it(
    'reports a themes folder that another program makes',
    async () => {
      const { themes, onChange, watcher } = await startWatch()
      try {
        await untilWatching(folder)
        mkdirSync(themes)
        writeFileSync(path.join(themes, 'brand.theme.json'), '{}')
        await expect.poll(() => onChange.mock.calls.length, { timeout: 5000 }).toBeGreaterThan(0)
      } finally {
        watcher.stop()
      }
    },
    SYSTEM_WATCH_TIMEOUT_MS,
  )

  it(
    'reports a theme file that another program adds to the themes folder',
    async () => {
      const themes = path.join(folder, 'themes')
      mkdirSync(themes)
      const { onChange, watcher } = await startWatch()
      try {
        await untilWatching(themes)
        writeFileSync(path.join(themes, 'brand.theme.json'), '{}')
        await expect.poll(() => onChange.mock.calls.length, { timeout: 5000 }).toBeGreaterThan(0)
      } finally {
        watcher.stop()
      }
    },
    SYSTEM_WATCH_TIMEOUT_MS,
  )
})
