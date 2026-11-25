import { execFileSync } from 'node:child_process'
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDiagram } from '@/model/defaults'
import { DIAGRAM_VERSION } from '@/model/schema'
import { committedText } from './git'
import { createLinkedFiles, isLinkedId, linkedIdOf } from './linked-files'
import { folderIdsOf } from './same-file'
import { STALE_TEMP_AGE_MS } from './temp-files'

const fileCalls = vi.hoisted(() => [] as string[][])
const fileFailure = vi.hoisted(() => ({ writeFile: false, sync: false }))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  const noSpace = () => Object.assign(new Error('No space left on the disk.'), { code: 'ENOSPC' })
  return {
    ...actual,
    writeFile: async (...args: Parameters<typeof actual.writeFile>) => {
      if (!fileFailure.writeFile) return actual.writeFile(...args)
      fileFailure.writeFile = false
      await actual.writeFile(args[0], 'part')
      throw noSpace()
    },
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args)
      const sync = handle.sync.bind(handle)
      handle.sync = async () => {
        fileCalls.push(['sync', String(args[0])])
        if (fileFailure.sync) {
          fileFailure.sync = false
          throw noSpace()
        }
        await sync()
      }
      return handle
    },
    rename: async (from: string, to: string) => {
      fileCalls.push(['rename', from, to])
      await actual.rename(from, to)
    },
  }
})

let root: string
let repo: string
let registry: string

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'linked-files-'))
  repo = path.join(root, 'repo')
  registry = path.join(root, 'user-data', 'linked-files.json')
  mkdirSync(path.join(repo, 'docs'), { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('createLinkedFiles', () => {
  it('links a file, writes changes where it is, and remembers it in a new session', async () => {
    const file = path.join(repo, 'docs', 'orders.diagram.json')
    writeFileSync(file, '{"name":"Orders"}')
    const linked = createLinkedFiles(registry)
    const opened = await linked.link(file)
    expect(opened).toEqual({ id: linkedIdOf(file), text: '{"name":"Orders"}', path: path.resolve(file) })
    expect(isLinkedId(opened.id)).toBe(true)

    await linked.write(opened.id, '{"name":"Orders v2"}')
    expect(readFileSync(file, 'utf8')).toBe('{"name":"Orders v2"}')

    const again = createLinkedFiles(registry)
    expect(await again.readAll()).toEqual([{ ...opened, text: '{"name":"Orders v2"}' }])
  })

  it('reports a change that another program makes, and not its own writes', async () => {
    const file = path.join(repo, 'docs', 'a.diagram.json')
    writeFileSync(file, 'one')
    const linked = createLinkedFiles(registry)
    const { id } = await linked.link(file)
    await linked.write(id, 'two')
    expect(await linked.rescan()).toEqual([])
    writeFileSync(file, 'three from git')
    expect(await linked.rescan()).toEqual([{ kind: 'changed', id, text: 'three from git', path: path.resolve(file) }])
  })

  it('takes a file off the list and keeps the file', async () => {
    const file = path.join(repo, 'docs', 'keep.diagram.json')
    writeFileSync(file, 'kept')
    const linked = createLinkedFiles(registry)
    const { id } = await linked.link(file)
    await linked.unlink(id)
    expect(readFileSync(file, 'utf8')).toBe('kept')
    expect(await createLinkedFiles(registry).readAll()).toEqual([])
  })

  it('creates a new file and links it', async () => {
    const file = path.join(repo, 'docs', 'new.diagram.json')
    const linked = createLinkedFiles(registry)
    const created = await linked.create(file, '{"name":"New"}')
    expect(readFileSync(file, 'utf8')).toBe('{"name":"New"}')
    expect(created.id).toBe(linkedIdOf(file))
  })

  it('refuses to link a file that it cannot read', async () => {
    const linked = createLinkedFiles(registry)
    await expect(linked.link(path.join(repo, 'missing.diagram.json'))).rejects.toThrow('could not be read')
    expect(await linked.readAll()).toEqual([])
  })

  it('links a plain JSON file only when it is a diagram', async () => {
    const linked = createLinkedFiles(registry)
    const diagram = path.join(repo, 'docs', 'orders.json')
    writeFileSync(diagram, JSON.stringify(createDiagram('Orders')))
    const newer = path.join(repo, 'docs', 'newer.json')
    writeFileSync(newer, JSON.stringify({ version: DIAGRAM_VERSION + 1, shape: 'unknown' }))
    const older = path.join(repo, 'docs', 'older.json')
    const sample = path.join(import.meta.dirname, '..', '..', 'src', 'persistence', 'formats', 'v6.json')
    const { diagrams } = JSON.parse(readFileSync(sample, 'utf8')) as { diagrams: unknown[] }
    writeFileSync(older, JSON.stringify(diagrams[0]))
    const packageFile = path.join(repo, 'package.json')
    writeFileSync(packageFile, '{"name":"shop","version":"1.0.0"}')
    const notJson = path.join(repo, 'docs', 'notes.json')
    writeFileSync(notJson, 'not json')

    expect((await linked.link(diagram)).path).toBe(diagram)
    expect((await linked.link(newer)).path).toBe(newer)
    expect((await linked.link(older)).path).toBe(older)
    await expect(linked.link(packageFile)).rejects.toThrow('package.json is not a diagram.')
    await expect(linked.link(notJson)).rejects.toThrow('notes.json is not a diagram.')
    expect((await createLinkedFiles(registry).readAll()).map((file) => file.path)).toEqual([diagram, newer, older])
  })

  it('links a .diagram.json file that the app cannot read, so that the library shows it', async () => {
    const file = path.join(repo, 'docs', 'conflict.diagram.json')
    writeFileSync(file, '<<<<<<< HEAD')
    await expect(createLinkedFiles(registry).link(file)).resolves.toMatchObject({ text: '<<<<<<< HEAD' })
  })

  it('keeps one entry for a file that it links through two paths', async () => {
    const file = path.join(repo, 'docs', 'once.diagram.json')
    writeFileSync(file, 'once')
    const junction = path.join(root, 'repo-link')
    symlinkSync(repo, junction, 'junction')
    const linked = createLinkedFiles(registry)
    const first = await linked.link(file)
    const second = await linked.link(path.join(junction, 'docs', 'once.diagram.json'))
    expect(second).toEqual(first)
    expect(await linked.create(path.join(junction, 'docs', 'once.diagram.json'), 'twice')).toMatchObject({
      id: first.id,
      path: file,
    })
    expect(readFileSync(file, 'utf8')).toBe('twice')
    expect(JSON.parse(readFileSync(registry, 'utf8'))).toEqual({ files: [file] })
  })

  it('flushes the new list to disk before it renames the list into place', async () => {
    const file = path.join(repo, 'docs', 'flushed.diagram.json')
    writeFileSync(file, 'x')
    fileCalls.length = 0
    await createLinkedFiles(registry).link(file)
    const renamed = fileCalls.find(([kind, , to]) => kind === 'rename' && to === registry)
    expect(renamed).toBeDefined()
    const temp = renamed![1]!
    expect(fileCalls.findIndex(([kind, target]) => kind === 'sync' && target === temp)).toBeGreaterThanOrEqual(0)
    expect(fileCalls.findIndex(([kind, target]) => kind === 'sync' && target === temp)).toBeLessThan(
      fileCalls.indexOf(renamed!),
    )
  })
})

describe('a damaged list of linked files', () => {
  const copies = () => readdirSync(path.dirname(registry)).filter((name) => name.startsWith('linked-files-damaged-'))

  function writeRegistry(text: string) {
    mkdirSync(path.dirname(registry), { recursive: true })
    writeFileSync(registry, text)
  }

  it('lists no linked files, keeps a copy of the list, and tells it once', async () => {
    writeRegistry('{"files": ["C:/repo/a.diagram.json"')
    const linked = createLinkedFiles(registry)
    expect(await linked.readAll()).toEqual([])
    expect(linked.takeReset()).toEqual({ copyKept: true })
    expect(linked.takeReset()).toBeNull()
    expect(copies()).toHaveLength(1)
    const copy = path.join(path.dirname(registry), copies()[0]!)
    expect(linked.damagedCopy()).toBe(copy)
    expect(readFileSync(copy, 'utf8')).toBe('{"files": ["C:/repo/a.diagram.json"')
    expect(JSON.parse(readFileSync(registry, 'utf8'))).toEqual({ files: [] })
    expect(createLinkedFiles(registry).takeReset()).toBeNull()
  })

  it.each(['', 'null', '[]', '42', '{}', '{"files":"a.diagram.json"}'])(
    'resets the list %j and links files after it',
    async (text) => {
      writeRegistry(text)
      const linked = createLinkedFiles(registry)
      expect(await linked.readAll()).toEqual([])
      expect(linked.takeReset()).toEqual({ copyKept: true })
      const file = path.join(repo, 'docs', 'after.diagram.json')
      writeFileSync(file, 'after')
      await linked.link(file)
      expect(await createLinkedFiles(registry).readAll()).toEqual([
        { id: linkedIdOf(file), text: 'after', path: path.resolve(file) },
      ])
    },
  )

  it('keeps the entries that it can read and drops the others', async () => {
    const file = path.join(repo, 'docs', 'kept.diagram.json')
    writeFileSync(file, 'kept')
    writeRegistry(JSON.stringify({ files: [file, 42, null, 'relative.diagram.json', { file }] }))
    const linked = createLinkedFiles(registry)
    const kept = { id: linkedIdOf(file), text: 'kept', path: path.resolve(file) }
    expect(await linked.readAll()).toEqual([kept])
    expect(linked.takeReset()).toEqual({ copyKept: true })
    expect(copies()).toHaveLength(1)
    const again = createLinkedFiles(registry)
    expect(await again.readAll()).toEqual([kept])
    expect(again.takeReset()).toBeNull()
  })

  it('removes only the old temporary files that the app made for the list and the linked files', async () => {
    const docs = path.join(repo, 'docs')
    const file = path.join(docs, 'orders.diagram.json')
    writeFileSync(file, 'orders')
    const aged = (target: string, suffix: string, ageMs: number) => {
      const temp = `${target}.tmp-${suffix}`
      writeFileSync(temp, 'part')
      const time = new Date(Date.now() - ageMs)
      utimesSync(temp, time, time)
    }
    const old = STALE_TEMP_AGE_MS * 2
    const linked = createLinkedFiles(registry)
    await linked.link(file)
    aged(file, '0a1b2c3d', old)
    aged(file, '1a2b3c4d', 0)
    aged(path.join(docs, 'notes.diagram.json'), '0a1b2c3d', old)
    aged(path.join(docs, 'notes.txt'), '0a1b2c3d', old)
    aged(registry, '0a1b2c3d', old)
    const again = createLinkedFiles(registry)
    expect(await again.readAll()).toEqual([{ id: linkedIdOf(file), text: 'orders', path: path.resolve(file) }])
    expect(readdirSync(docs).toSorted()).toEqual([
      'notes.diagram.json.tmp-0a1b2c3d',
      'notes.txt.tmp-0a1b2c3d',
      'orders.diagram.json',
      'orders.diagram.json.tmp-1a2b3c4d',
    ])
    expect(readdirSync(path.dirname(registry))).toEqual(['linked-files.json'])
    aged(file, '1a2b3c4d', old)
    expect(await again.rescan()).toEqual([])
    expect(readdirSync(docs).toSorted()).toEqual([
      'notes.diagram.json.tmp-0a1b2c3d',
      'notes.txt.tmp-0a1b2c3d',
      'orders.diagram.json',
    ])
  })

  it('removes the part of a failed write of a linked file, and keeps the file', async () => {
    const file = path.join(repo, 'docs', 'orders.diagram.json')
    writeFileSync(file, 'old')
    const linked = createLinkedFiles(registry)
    const { id } = await linked.link(file)
    fileFailure.writeFile = true
    await expect(linked.write(id, 'new')).rejects.toMatchObject({ code: 'ENOSPC' })
    expect(readdirSync(path.join(repo, 'docs'))).toEqual(['orders.diagram.json'])
    expect(readFileSync(file, 'utf8')).toBe('old')
  })

  it('removes the part of a failed write of the list, and keeps the list', async () => {
    const file = path.join(repo, 'docs', 'orders.diagram.json')
    const other = path.join(repo, 'docs', 'other.diagram.json')
    writeFileSync(file, 'orders')
    writeFileSync(other, 'other')
    const linked = createLinkedFiles(registry)
    await linked.link(file)
    fileFailure.sync = true
    await expect(linked.link(other)).rejects.toMatchObject({ code: 'ENOSPC' })
    expect(readdirSync(path.dirname(registry))).toEqual(['linked-files.json'])
    expect(JSON.parse(readFileSync(registry, 'utf8'))).toEqual({ files: [path.resolve(file)] })
  })

  it('checks a damaged list for changes without a failure', async () => {
    writeRegistry('not json')
    await expect(createLinkedFiles(registry).rescan()).resolves.toEqual([])
  })

  it('reads the list again after a read error, and does not change the list until then', async () => {
    mkdirSync(registry, { recursive: true })
    const linked = createLinkedFiles(registry)
    expect(await linked.readAll()).toEqual([])
    const file = path.join(repo, 'docs', 'later.diagram.json')
    writeFileSync(file, 'later')
    await expect(linked.link(file)).rejects.toThrow()
    expect(linked.takeReset()).toBeNull()
    rmSync(registry, { recursive: true })
    writeRegistry(JSON.stringify({ files: [file] }))
    expect(await linked.readAll()).toEqual([{ id: linkedIdOf(file), text: 'later', path: path.resolve(file) }])
  })
})

describe('duplicate entries in the list of linked files', () => {
  let folder: string

  beforeEach(() => {
    folder = path.join(root, 'Diagrams')
    mkdirSync(folder)
  })

  const inFolder = async (files: readonly string[]) => (await folderIdsOf(folder, files)).map((id) => id !== null)

  function writeRegistry(files: string[]) {
    mkdirSync(path.dirname(registry), { recursive: true })
    writeFileSync(registry, JSON.stringify({ files }))
  }

  it('takes off each file that the diagrams folder lists, and keeps the files', async () => {
    const folderFile = path.join(folder, 'd_orders.diagram.json')
    writeFileSync(folderFile, 'in the folder')
    const viaJunction = path.join(root, 'Moved diagrams')
    symlinkSync(folder, viaJunction, 'junction')
    const notListed = path.join(folder, 'notes.json')
    writeFileSync(notListed, 'not listed')
    const repoFile = path.join(repo, 'docs', 'repo.diagram.json')
    writeFileSync(repoFile, 'in the repo')
    writeRegistry([folderFile, path.join(viaJunction, 'd_orders.diagram.json'), notListed, repoFile])

    const linked = createLinkedFiles(registry, { listedInFolder: inFolder })
    expect((await linked.readAll()).map((file) => file.path)).toEqual([notListed, repoFile])
    expect(linked.takeReset()).toBeNull()
    expect(JSON.parse(readFileSync(registry, 'utf8'))).toEqual({ files: [notListed, repoFile] })
    expect(readFileSync(folderFile, 'utf8')).toBe('in the folder')
  })

  it('keeps the first of two entries for one file', async () => {
    const file = path.join(repo, 'docs', 'twice.diagram.json')
    writeFileSync(file, 'twice')
    const hardLink = path.join(root, 'twice.diagram.json')
    linkSync(file, hardLink)
    writeRegistry([file, hardLink, path.join(repo, 'docs', '..', 'docs', 'twice.diagram.json')])

    const linked = createLinkedFiles(registry, { listedInFolder: inFolder })
    expect(await linked.readAll()).toEqual([{ id: linkedIdOf(file), text: 'twice', path: file }])
    expect(JSON.parse(readFileSync(registry, 'utf8'))).toEqual({ files: [file] })
    expect(readFileSync(hardLink, 'utf8')).toBe('twice')
  })

  it('keeps the list as it is when it has no duplicates, or when the folder check fails', async () => {
    const file = path.join(repo, 'docs', 'only.diagram.json')
    writeFileSync(file, 'only')
    const text = JSON.stringify({ files: [file] })
    mkdirSync(path.dirname(registry), { recursive: true })
    writeFileSync(registry, text)
    const failing = async (): Promise<boolean[]> => {
      throw new Error('The folder cannot be read.')
    }
    expect(await createLinkedFiles(registry, { listedInFolder: failing }).readAll()).toHaveLength(1)
    expect(await createLinkedFiles(registry, { listedInFolder: inFolder }).readAll()).toHaveLength(1)
    expect(readFileSync(registry, 'utf8')).toBe(text)
  })
})

describe('committedText', () => {
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', repo, ...args], {
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Test',
        GIT_AUTHOR_EMAIL: 't@x',
        GIT_COMMITTER_NAME: 'Test',
        GIT_COMMITTER_EMAIL: 't@x',
      },
    })

  it('reads a file from the last commit of its repository', async () => {
    const file = path.join(repo, 'docs', 'flow.diagram.json')
    git('init', '-q')
    writeFileSync(file, 'committed')
    git('add', '.')
    git('-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'first')
    writeFileSync(file, 'changed since')
    expect(await committedText(file)).toBe('committed')
  })

  it('explains a file outside a repository and a file that the last commit does not have', async () => {
    const file = path.join(repo, 'docs', 'loose.diagram.json')
    writeFileSync(file, 'x')
    await expect(committedText(file)).rejects.toThrow('This file is not in a git repository.')
    git('init', '-q')
    writeFileSync(path.join(repo, 'other.txt'), 'y')
    git('add', 'other.txt')
    git('-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'first')
    await expect(committedText(file)).rejects.toThrow('The last commit has no version of this file.')
  })
})
