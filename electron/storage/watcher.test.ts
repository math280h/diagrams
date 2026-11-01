import { EventEmitter } from 'node:events'
import { mkdirSync, watch, type FSWatcher } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FileChange } from '@/desktop/contract'
import type { DiagramFiles } from './diagram-files'
import type { LinkedFiles } from './linked-files'
import { watchDiagramFolder, watchLinkedFiles } from './watcher'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, watch: vi.fn(), mkdirSync: vi.fn() }
})

const DEBOUNCE_MS = 150
const RESTART_DELAY_MS = 1000

type Listener = (event: string, name: string | null) => void

interface FakeWatcher {
  folder: string
  emitChange: (name: string | null) => void
  fail: () => void
  close: ReturnType<typeof vi.fn>
}

let watchers: FakeWatcher[] = []

function fakeWatch(folder: string, listener: Listener): FSWatcher {
  const emitter = new EventEmitter()
  const close = vi.fn()
  watchers.push({
    folder,
    emitChange: (name) => listener('change', name),
    fail: () => emitter.emit('error', new Error('The folder is gone.')),
    close,
  })
  return Object.assign(emitter, { close }) as unknown as FSWatcher
}

function lastWatcherOf(folder: string): FakeWatcher {
  return watchers.findLast((watcher) => watcher.folder === folder)!
}

beforeEach(() => {
  watchers = []
  vi.useFakeTimers()
  vi.mocked(watch).mockImplementation(fakeWatch as unknown as typeof watch)
  vi.mocked(mkdirSync).mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.mocked(watch).mockReset()
})

describe('watchDiagramFolder', () => {
  const folder = path.join(path.sep, 'diagrams')

  function setup() {
    const files = {
      folder,
      inspect: vi.fn(async (id: string): Promise<FileChange | null> => ({
        kind: 'changed',
        id,
        text: `text of ${id}`,
      })),
      rescan: vi.fn(async (): Promise<(FileChange | null)[]> => []),
    }
    const changes: FileChange[] = []
    const watcher = watchDiagramFolder(files as unknown as DiagramFiles, (change) => changes.push(change))
    return { files, changes, watcher }
  }

  it('creates the folder and watches it', () => {
    const { watcher } = setup()
    expect(mkdirSync).toHaveBeenCalledWith(folder, { recursive: true })
    expect(watchers.map((item) => item.folder)).toEqual([folder])
    watcher.stop()
  })

  it('checks a file once after a burst of events and reports the change', async () => {
    const { files, changes, watcher } = setup()
    const fs = watchers[0]!
    fs.emitChange('d_a.diagram.json')
    await vi.advanceTimersByTimeAsync(100)
    fs.emitChange('d_a.diagram.json')
    await vi.advanceTimersByTimeAsync(100)
    fs.emitChange('d_a.diagram.json')
    expect(files.inspect).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    expect(files.inspect).toHaveBeenCalledTimes(1)
    expect(files.inspect).toHaveBeenCalledWith('d_a')
    expect(changes).toEqual([{ kind: 'changed', id: 'd_a', text: 'text of d_a' }])
    watcher.stop()
  })

  it('checks each changed file on its own', async () => {
    const { files, watcher } = setup()
    watchers[0]!.emitChange('d_a.diagram.json')
    watchers[0]!.emitChange('d_b.diagram.json')
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    expect(files.inspect.mock.calls.map(([id]) => id)).toEqual(['d_a', 'd_b'])
    watcher.stop()
  })

  it('ignores temporary files and files that are not diagrams', async () => {
    const { files, watcher } = setup()
    watchers[0]!.emitChange('d_a.diagram.json.tmp-1a2b3c4d')
    watchers[0]!.emitChange('notes.txt')
    watchers[0]!.emitChange('../escape.diagram.json')
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    expect(files.inspect).not.toHaveBeenCalled()
    watcher.stop()
  })

  it('reports nothing for a file that the app wrote itself', async () => {
    const { files, changes, watcher } = setup()
    files.inspect.mockResolvedValueOnce(null)
    watchers[0]!.emitChange('d_mine.diagram.json')
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    expect(changes).toEqual([])
    watcher.stop()
  })

  it('checks the whole folder when an event has no file name', async () => {
    const { files, changes, watcher } = setup()
    files.rescan.mockResolvedValueOnce([{ kind: 'removed', id: 'd_gone' }, null])
    watchers[0]!.emitChange(null)
    await vi.advanceTimersByTimeAsync(0)
    expect(files.rescan).toHaveBeenCalledTimes(1)
    expect(changes).toEqual([{ kind: 'removed', id: 'd_gone' }])
    watcher.stop()
  })

  it('checks the whole folder on request', async () => {
    const { files, changes, watcher } = setup()
    files.rescan.mockResolvedValueOnce([{ kind: 'changed', id: 'd_a', text: 'new' }])
    watcher.rescan()
    await vi.advanceTimersByTimeAsync(0)
    expect(changes).toEqual([{ kind: 'changed', id: 'd_a', text: 'new' }])
    watcher.stop()
  })

  it('watches again after an error, and then checks the whole folder', async () => {
    const { files, watcher } = setup()
    const first = watchers[0]!
    first.fail()
    expect(first.close).toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(RESTART_DELAY_MS - 1)
    expect(watchers).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(watchers).toHaveLength(2)
    expect(files.rescan).toHaveBeenCalledTimes(1)
    watcher.stop()
    expect(watchers[1]!.close).toHaveBeenCalled()
  })

  it('tries again later when it cannot create the folder', async () => {
    vi.mocked(mkdirSync).mockImplementationOnce(() => {
      throw new Error('The drive is not ready.')
    })
    const { watcher } = setup()
    expect(watchers).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(RESTART_DELAY_MS)
    expect(watchers.map((item) => item.folder)).toEqual([folder])
    watcher.stop()
  })

  it('stops the watcher and drops the checks that wait', async () => {
    const { files, watcher } = setup()
    watchers[0]!.emitChange('d_a.diagram.json')
    watcher.stop()
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    expect(files.inspect).not.toHaveBeenCalled()
    expect(watchers[0]!.close).toHaveBeenCalled()
  })

  it('does not watch again after a stop', async () => {
    const { files, watcher } = setup()
    watchers[0]!.fail()
    watcher.stop()
    await vi.advanceTimersByTimeAsync(RESTART_DELAY_MS * 2)
    expect(watchers).toHaveLength(1)
    expect(files.rescan).not.toHaveBeenCalled()
  })
})

describe('watchLinkedFiles', () => {
  const docs = path.join(path.sep, 'repo', 'docs')
  const other = path.join(path.sep, 'other')

  function setup(initial: { id: string; file: string }[]) {
    let entries = initial
    const linked = {
      entries: () => entries,
      pathOf: (id: string) => entries.find((entry) => entry.id === id)?.file ?? null,
      inspect: vi.fn(async (id: string): Promise<FileChange | null> => ({
        kind: 'changed',
        id,
        text: `text of ${id}`,
      })),
      rescan: vi.fn(async (): Promise<FileChange[]> => []),
    }
    const changes: FileChange[] = []
    const watcher = watchLinkedFiles(linked as unknown as LinkedFiles, (change) => changes.push(change))
    const setEntries = (next: { id: string; file: string }[]) => {
      entries = next
    }
    return { linked, changes, watcher, setEntries }
  }

  const orders = { id: 'link-orders', file: path.join(docs, 'orders.diagram.json') }
  const billing = { id: 'link-billing', file: path.join(docs, 'billing.diagram.json') }
  const notes = { id: 'link-notes', file: path.join(other, 'notes.diagram.json') }

  it('watches each folder of the linked files once', () => {
    const { watcher } = setup([orders, billing, notes])
    expect(watchers).toHaveLength(0)
    watcher.sync()
    expect(watchers.map((item) => item.folder)).toEqual([docs, other])
    watcher.sync()
    expect(watchers).toHaveLength(2)
    watcher.stop()
  })

  it('reports a change of a linked file with its path, after a burst of events', async () => {
    const { linked, changes, watcher } = setup([orders, billing])
    watcher.sync()
    lastWatcherOf(docs).emitChange('orders.diagram.json')
    lastWatcherOf(docs).emitChange('orders.diagram.json')
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    expect(linked.inspect).toHaveBeenCalledTimes(1)
    expect(changes).toEqual([{ kind: 'changed', id: orders.id, text: `text of ${orders.id}`, path: orders.file }])
    watcher.stop()
  })

  it('reports a removed linked file', async () => {
    const { linked, changes, watcher } = setup([orders])
    linked.inspect.mockResolvedValueOnce({ kind: 'removed', id: orders.id })
    watcher.sync()
    lastWatcherOf(docs).emitChange('orders.diagram.json')
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    expect(changes).toEqual([{ kind: 'removed', id: orders.id }])
    watcher.stop()
  })

  it('ignores other files in a watched folder, temporary files and events without a name', async () => {
    const { linked, changes, watcher } = setup([orders])
    linked.inspect.mockResolvedValue(null)
    watcher.sync()
    const fs = lastWatcherOf(docs)
    fs.emitChange('README.md')
    fs.emitChange('orders.diagram.json.tmp-0a1b2c3d')
    fs.emitChange(null)
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    expect(linked.inspect).not.toHaveBeenCalled()
    fs.emitChange('orders.diagram.json')
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    expect(changes).toEqual([])
    watcher.stop()
  })

  it('stops watching a folder that no linked file uses any more', () => {
    const { watcher, setEntries } = setup([orders, notes])
    watcher.sync()
    setEntries([orders])
    watcher.sync()
    expect(lastWatcherOf(other).close).toHaveBeenCalled()
    expect(lastWatcherOf(docs).close).not.toHaveBeenCalled()
    expect(watchers).toHaveLength(2)
    watcher.stop()
  })

  it('watches a folder again at the next sync after an error', () => {
    const { watcher } = setup([orders])
    watcher.sync()
    const first = lastWatcherOf(docs)
    first.fail()
    expect(first.close).toHaveBeenCalled()
    watcher.sync()
    expect(watchers).toHaveLength(2)
    watcher.stop()
  })

  it('watches the other folders when it cannot watch one', () => {
    vi.mocked(watch).mockImplementationOnce(() => {
      throw new Error('The folder does not exist.')
    })
    const { watcher } = setup([notes, orders])
    watcher.sync()
    expect(watchers.map((item) => item.folder)).toEqual([docs])
    watcher.stop()
  })

  it('checks every linked file on request', async () => {
    const { linked, changes, watcher } = setup([orders])
    linked.rescan.mockResolvedValueOnce([{ kind: 'changed', id: orders.id, text: 'from git', path: orders.file }])
    watcher.rescan()
    await vi.advanceTimersByTimeAsync(0)
    expect(changes).toEqual([{ kind: 'changed', id: orders.id, text: 'from git', path: orders.file }])
    watcher.stop()
  })

  it('stops all folder watchers and drops the checks that wait', async () => {
    const { linked, watcher } = setup([orders, notes])
    watcher.sync()
    lastWatcherOf(docs).emitChange('orders.diagram.json')
    watcher.stop()
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS)
    expect(linked.inspect).not.toHaveBeenCalled()
    expect(watchers.every((item) => item.close.mock.calls.length > 0)).toBe(true)
  })
})
