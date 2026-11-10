import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFolderFiles, deletedFileName, writeText, writeWholeFile } from './folder-files'

let root: FileSystemDirectoryHandle
let folder: FileSystemDirectoryHandle

async function readText(name: string) {
  return (await (await folder.getFileHandle(name)).getFile()).text()
}

async function names() {
  const found: string[] = []
  for await (const name of folder.keys()) found.push(name)
  return found.toSorted()
}

beforeEach(async () => {
  root = await navigator.storage.getDirectory()
  folder = await root.getDirectoryHandle(`folder-${crypto.randomUUID()}`, { create: true })
})

afterEach(async () => {
  await root.removeEntry(folder.name, { recursive: true })
})

describe('folder files', () => {
  it('lists the diagram files with a safe name and nothing else', async () => {
    await writeText(folder, 'd_shop.diagram.json', '{"name":"Shop"}')
    await writeText(folder, 'notes.md', '# Notes')
    await writeText(folder, '.hidden.diagram.json', '{}')
    await folder.getDirectoryHandle('nested.diagram.json', { create: true })
    const files = await createFolderFiles(folder).list()
    expect(files).toEqual([{ id: 'd_shop', text: '{"name":"Shop"}' }])
  })

  it('writes a diagram file under its id, and moves a deleted one to .diagrams/deleted', async () => {
    const files = createFolderFiles(folder)
    await files.write({ id: 'd_new', text: 'first' })
    await files.write({ id: 'd_new', text: 'second' })
    expect(await readText('d_new.diagram.json')).toBe('second')
    await files.remove('d_new')
    await files.remove('d_new')
    expect(await names()).toEqual(['.diagrams'])

    const deleted = await (await folder.getDirectoryHandle('.diagrams')).getDirectoryHandle('deleted')
    const kept: string[] = []
    for await (const name of deleted.keys()) kept.push(name)
    expect(kept).toHaveLength(1)
    expect(kept[0]).toMatch(/^d_new \d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.diagram\.json$/)
    expect(await (await (await deleted.getFileHandle(kept[0]!)).getFile()).text()).toBe('second')
  })

  it('names each copy of a deleted file by its id and the time', () => {
    expect(deletedFileName('d_shop', new Date('2026-11-10T22:50:01.123Z'))).toBe(
      'd_shop 2026-11-10T22-50-01.diagram.json',
    )
  })

  it('keeps a change from outside that came after the last read, and reports it instead of the write', async () => {
    const outside: unknown[] = []
    const files = createFolderFiles(folder, (change) => outside.push(change))
    await files.write({ id: 'd_a', text: 'from the app' })
    await writeText(folder, 'd_a.diagram.json', 'from an agent')
    await files.write({ id: 'd_a', text: 'a later save of the app' })
    expect(await readText('d_a.diagram.json')).toBe('from an agent')
    expect(outside).toEqual([{ kind: 'changed', id: 'd_a', text: 'from an agent' }])
    expect(await files.changes(['d_a.diagram.json'])).toEqual([])

    await files.write({ id: 'd_a', text: 'the next save of the app' })
    expect(await readText('d_a.diagram.json')).toBe('the next save of the app')
  })

  it('reports only the changes that the app did not make', async () => {
    const files = createFolderFiles(folder)
    await writeText(folder, 'd_a.diagram.json', 'a')
    await writeText(folder, 'd_b.diagram.json', 'b')
    await files.list()
    await files.write({ id: 'd_a', text: 'a from the app' })
    expect(await files.changes(['d_a.diagram.json', 'd_b.diagram.json'])).toEqual([])

    await writeText(folder, 'd_a.diagram.json', 'a from an editor')
    await writeText(folder, 'd_c.diagram.json', 'c')
    await folder.removeEntry('d_b.diagram.json')
    expect(await files.changes(['d_a.diagram.json', 'd_b.diagram.json', 'd_c.diagram.json', 'notes.md'])).toEqual([
      { kind: 'changed', id: 'd_a', text: 'a from an editor' },
      { kind: 'removed', id: 'd_b' },
      { kind: 'changed', id: 'd_c', text: 'c' },
    ])
    expect(await files.changes(['d_a.diagram.json', 'd_b.diagram.json'])).toEqual([])
  })
})

describe('writeWholeFile', () => {
  it('writes a hidden part file and renames it, also over an older file', async () => {
    await writeWholeFile(folder, 'result.json', '{"ok":false}')
    await writeWholeFile(folder, 'result.json', '{"ok":true}')
    expect(await readText('result.json')).toBe('{"ok":true}')
    expect(await names()).toEqual(['result.json'])
  })

  it('writes the file directly in a browser that cannot rename it', async () => {
    const move = Object.getOwnPropertyDescriptor(FileSystemHandle.prototype, 'move')
    Object.defineProperty(FileSystemHandle.prototype, 'move', { value: undefined, configurable: true })
    try {
      await writeWholeFile(folder, 'status.md', '# Status')
    } finally {
      if (move) Object.defineProperty(FileSystemHandle.prototype, 'move', move)
    }
    expect(await readText('status.md')).toBe('# Status')
    expect(await names()).toEqual(['status.md'])
  })
})
