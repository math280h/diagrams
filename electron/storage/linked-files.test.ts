import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { committedText } from './git'
import { createLinkedFiles, isLinkedId, linkedIdOf } from './linked-files'

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
