import { linkSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fileKeysOf, folderIdOf, folderIdsOf, isSameFile, pathKey } from './same-file'

const caseInsensitive = process.platform === 'win32' || process.platform === 'darwin'

let root: string
let folder: string
let repo: string

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'same-file-'))
  folder = path.join(root, 'Diagrams')
  repo = path.join(root, 'repo')
  mkdirSync(folder)
  mkdirSync(repo)
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function write(file: string, text = '{}') {
  writeFileSync(file, text)
  return file
}

describe('pathKey', () => {
  it('ignores letter case on Windows and macOS, and keeps it on Linux', () => {
    const file = path.join(root, 'Docs', 'Orders.diagram.json')
    expect(pathKey(file, 'win32')).toBe(path.resolve(file).toLowerCase())
    expect(pathKey(file, 'darwin')).toBe(path.resolve(file).toLowerCase())
    expect(pathKey(file, 'linux')).toBe(path.resolve(file))
  })

  it('resolves relative parts', () => {
    const file = path.join(root, 'a', 'b', 'c.json')
    expect(pathKey(path.join(root, 'a', 'x', '..', 'b', '.', 'c.json'))).toBe(pathKey(file))
  })
})

describe('isSameFile', () => {
  it('finds one file through relative parts, a junction and a hard link', async () => {
    const file = write(path.join(repo, 'orders.diagram.json'))
    const junction = path.join(root, 'repo-link')
    symlinkSync(repo, junction, 'junction')
    const hardLink = path.join(root, 'orders-copy.diagram.json')
    linkSync(file, hardLink)

    expect(await isSameFile(file, path.join(repo, 'docs', '..', 'orders.diagram.json'))).toBe(true)
    expect(await isSameFile(file, path.join(junction, 'orders.diagram.json'))).toBe(true)
    expect(await isSameFile(file, hardLink)).toBe(true)
    expect(await isSameFile(repo, junction)).toBe(true)
  })

  it('tells different files apart, also files that do not exist', async () => {
    const file = write(path.join(repo, 'a.diagram.json'))
    const other = write(path.join(repo, 'b.diagram.json'))
    expect(await isSameFile(file, other)).toBe(false)
    expect(await isSameFile(file, path.join(repo, 'missing.diagram.json'))).toBe(false)
    expect(await isSameFile(path.join(repo, 'x.json'), path.join(repo, 'y.json'))).toBe(false)
    expect(await isSameFile(path.join(repo, 'x.json'), path.join(repo, 'sub', '..', 'x.json'))).toBe(true)
  })

  it.runIf(caseInsensitive)('ignores letter case on a file system that ignores it', async () => {
    const file = write(path.join(repo, 'Orders.diagram.json'))
    expect(await isSameFile(file, path.join(repo.toUpperCase(), 'orders.DIAGRAM.json'))).toBe(true)
  })

  it('gives one key to each path of one file', async () => {
    const file = write(path.join(repo, 'a.diagram.json'))
    const hardLink = path.join(root, 'a.diagram.json')
    linkSync(file, hardLink)
    const [first, second, third] = await fileKeysOf([file, hardLink, write(path.join(repo, 'b.diagram.json'))])
    expect(first).toBe(second)
    expect(third).not.toBe(first)
  })
})

describe('folderIdOf', () => {
  it('returns the id of a diagram file in the folder', async () => {
    write(path.join(folder, 'd_orders.diagram.json'))
    expect(await folderIdOf(folder, path.join(folder, 'd_orders.diagram.json'))).toBe('d_orders')
    expect(await folderIdOf(folder, path.join(folder, 'themes', '..', 'd_orders.diagram.json'))).toBe('d_orders')
  })

  it('returns the id of a new diagram file in the folder', async () => {
    expect(await folderIdOf(folder, path.join(folder, 'New plan.diagram.json'))).toBe('New plan')
  })

  it('finds the folder through a junction, and the folder through a junction to it', async () => {
    write(path.join(folder, 'd_orders.diagram.json'))
    const junction = path.join(root, 'Moved diagrams')
    symlinkSync(folder, junction, 'junction')
    expect(await folderIdOf(folder, path.join(junction, 'd_orders.diagram.json'))).toBe('d_orders')
    expect(await folderIdOf(junction, path.join(folder, 'd_orders.diagram.json'))).toBe('d_orders')
    expect(await folderIdOf(folder, path.join(junction, 'Later.diagram.json'))).toBe('Later')
  })

  it('finds a file of the folder through a hard link outside it', async () => {
    const file = write(path.join(folder, 'd_orders.diagram.json'))
    const outside = path.join(repo, 'orders.diagram.json')
    linkSync(file, outside)
    expect(await folderIdOf(folder, outside)).toBe('d_orders')
  })

  it.runIf(caseInsensitive)('returns the id with the letter case of the file on disk', async () => {
    write(path.join(folder, 'Orders.diagram.json'))
    expect(await folderIdOf(folder, path.join(folder.toUpperCase(), 'orders.diagram.json'))).toBe('Orders')
  })

  it('returns the ids of several files in their order', async () => {
    const file = write(path.join(folder, 'd_orders.diagram.json'))
    const hardLink = path.join(repo, 'orders.diagram.json')
    linkSync(file, hardLink)
    const outside = write(path.join(repo, 'other.diagram.json'))
    expect(await folderIdsOf(folder, [outside, hardLink, file, path.join(folder, 'New.diagram.json')])).toEqual([
      null,
      'd_orders',
      'd_orders',
      'New',
    ])
    expect(await folderIdsOf(path.join(root, 'missing'), [file, outside])).toEqual([null, null])
  })

  it('returns null for a file that the folder does not list', async () => {
    mkdirSync(path.join(folder, 'themes'))
    write(path.join(folder, 'themes', 'dusk.theme.json'))
    write(path.join(folder, 'notes.json'))
    write(path.join(repo, 'orders.diagram.json'))
    expect(await folderIdOf(folder, path.join(folder, 'themes', 'dusk.theme.json'))).toBeNull()
    expect(await folderIdOf(folder, path.join(folder, 'notes.json'))).toBeNull()
    expect(await folderIdOf(folder, path.join(folder, '.hidden.diagram.json'))).toBeNull()
    expect(await folderIdOf(folder, path.join(repo, 'orders.diagram.json'))).toBeNull()
    expect(await folderIdOf(folder, path.join(repo, 'new.diagram.json'))).toBeNull()
    expect(await folderIdOf(path.join(root, 'missing'), path.join(root, 'missing', 'a.diagram.json'))).toBeNull()
  })
})
