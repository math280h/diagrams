import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { committedText } from './git'
import { createLinkedFiles, isLinkedId, linkedIdOf } from './linked-files'

const fileCalls = vi.hoisted(() => [] as string[][])

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args)
      const sync = handle.sync.bind(handle)
      handle.sync = async () => {
        fileCalls.push(['sync', String(args[0])])
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
