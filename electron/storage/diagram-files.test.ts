import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FileChange } from '@/desktop/contract'
import { createDiagramFiles, idOfFile, isSafeId } from './diagram-files'
import { watchDiagramFolder } from './watcher'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, rename: vi.fn(actual.rename), readFile: vi.fn(actual.readFile) }
})

const busy = () => Object.assign(new Error('The file is in use.'), { code: 'EBUSY' })

let folder: string

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'diagram-files-'))
})

afterEach(() => {
  vi.mocked(fsPromises.rename).mockReset()
  vi.mocked(fsPromises.readFile).mockReset()
  rmSync(folder, { recursive: true, force: true })
})

describe('ids', () => {
  it('accepts ids that are safe file names', () => {
    expect(isSafeId('d_abc123')).toBe(true)
    expect(isSafeId('My diagram (2)')).toBe(true)
    expect(isSafeId('../escape')).toBe(false)
    expect(isSafeId('a/b')).toBe(false)
    expect(isSafeId('trailing.')).toBe(false)
    expect(isSafeId('.hidden')).toBe(false)
  })

  it('reads the id from a diagram file name', () => {
    expect(idOfFile('d_abc.diagram.json')).toBe('d_abc')
    expect(idOfFile('notes.json')).toBeNull()
  })
})

describe('createDiagramFiles', () => {
  it('writes atomically and reads the folder back', async () => {
    const files = createDiagramFiles(folder)
    await files.write('d_one', '{"name":"One"}')
    expect(readdirSync(folder)).toEqual(['d_one.diagram.json'])
    expect(await files.readAll()).toEqual([{ id: 'd_one', text: '{"name":"One"}' }])
  })

  it('reads the folder after its own pending writes', async () => {
    const files = createDiagramFiles(folder)
    await files.write('d_one', 'old')
    vi.mocked(fsPromises.rename).mockRejectedValueOnce(busy())
    const pending = files.write('d_one', 'new')
    expect(await files.readAll()).toEqual([{ id: 'd_one', text: 'new' }])
    await pending
  })

  it('writes only the latest of several quick saves', async () => {
    const files = createDiagramFiles(folder)
    const writes = [files.write('d_one', 'first'), files.write('d_one', 'second'), files.write('d_one', 'third')]
    await Promise.all(writes)
    expect(readFileSync(path.join(folder, 'd_one.diagram.json'), 'utf8')).toBe('third')
  })

  it('refuses an unsafe id', async () => {
    await expect(createDiagramFiles(folder).write('../x', 'text')).rejects.toThrow('not a valid diagram id')
  })

  it('does not read a file whose size and change time it knows', async () => {
    const files = createDiagramFiles(folder)
    await files.write('d_one', 'mine')
    vi.mocked(fsPromises.readFile).mockClear()
    expect(await files.inspect('d_one')).toBeNull()
    expect(await files.rescan()).toEqual([])
    expect(fsPromises.readFile).not.toHaveBeenCalled()
  })

  it('tells changes of other programs from its own writes', async () => {
    const files = createDiagramFiles(folder)
    await files.write('d_one', 'mine')
    expect(await files.inspect('d_one')).toBeNull()
    writeFileSync(path.join(folder, 'd_one.diagram.json'), 'theirs')
    expect(await files.inspect('d_one')).toEqual({ kind: 'changed', id: 'd_one', text: 'theirs' })
    rmSync(path.join(folder, 'd_one.diagram.json'))
    expect(await files.inspect('d_one')).toEqual({ kind: 'removed', id: 'd_one' })
  })

  it('does not report its own older content after a write fails', async () => {
    const files = createDiagramFiles(folder)
    await files.write('d_one', 'first')
    vi.mocked(fsPromises.rename).mockRejectedValue(busy())
    await expect(files.write('d_one', 'second')).rejects.toThrow('in use')
    vi.mocked(fsPromises.rename).mockReset()
    expect(readFileSync(path.join(folder, 'd_one.diagram.json'), 'utf8')).toBe('first')
    expect(await files.inspect('d_one')).toBeNull()
    expect(readdirSync(folder)).toEqual(['d_one.diagram.json'])
  })

  it('ignores a read that overlaps its own write', async () => {
    const files = createDiagramFiles(folder)
    await files.write('d_one', 'first')
    writeFileSync(path.join(folder, 'd_one.diagram.json'), 'theirs, a little longer')
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.mocked(fsPromises.readFile).mockImplementationOnce(async (...args: Parameters<typeof actual.readFile>) => {
      const text = await actual.readFile(...args)
      await gate
      return text
    })
    const inspected = files.inspect('d_one')
    await vi.waitFor(() => expect(fsPromises.readFile).toHaveBeenCalled())
    await files.write('d_one', 'second')
    release()
    expect(await inspected).toBeNull()
    expect(await files.inspect('d_one')).toBeNull()
  })

  it('keeps a file it could not remove', async () => {
    const trash = vi.fn(async () => {
      throw busy()
    })
    const files = createDiagramFiles(folder, { trash })
    await files.write('d_one', 'text')
    vi.spyOn(fsPromises, 'unlink').mockRejectedValueOnce(busy())
    await expect(files.remove('d_one')).rejects.toThrow('in use')
    expect(await files.inspect('d_one')).toBeNull()
  })

  it('moves a removed file to the trash', async () => {
    const trash = vi.fn(async (file: string) => rmSync(file))
    const files = createDiagramFiles(folder, { trash })
    await files.write('d_one', 'text')
    await files.remove('d_one')
    expect(trash).toHaveBeenCalledWith(path.join(folder, 'd_one.diagram.json'))
    expect(await files.inspect('d_one')).toBeNull()
  })

  it('deletes a file without the trash when the remove asks for it', async () => {
    const trash = vi.fn(async () => undefined)
    const files = createDiagramFiles(folder, { trash })
    await files.write('d_one', 'text')
    await files.remove('d_one', { trash: false })
    expect(trash).not.toHaveBeenCalled()
    expect(readdirSync(folder)).toEqual([])
    expect(await files.inspect('d_one')).toBeNull()
  })
})

describe('watchDiagramFolder', () => {
  it('reports a file that another program adds, and not its own writes', { timeout: 20_000 }, async () => {
    const files = createDiagramFiles(folder)
    await files.readAll()
    const changes: FileChange[] = []
    const watcher = watchDiagramFolder(files, (change) => changes.push(change))
    try {
      await files.write('d_mine', 'mine')
      // On macOS, fs.watch can miss a change that occurs immediately after the watch starts.
      await vi.waitFor(
        () => {
          writeFileSync(path.join(folder, 'd_theirs.diagram.json'), 'theirs')
          expect(changes).toContainEqual({ kind: 'changed', id: 'd_theirs', text: 'theirs' })
        },
        { timeout: 15_000, interval: 500 },
      )
      expect(changes.some((change) => change.id === 'd_mine')).toBe(false)
    } finally {
      watcher.stop()
    }
  })
})
