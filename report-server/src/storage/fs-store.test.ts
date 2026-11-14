import { mkdtemp, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFsStore } from './fs-store'

const ID = 'a'.repeat(32)
const HASH = 'b'.repeat(64)
const OTHER_HASH = 'c'.repeat(64)

describe('createFsStore', () => {
  let dir: string

  beforeEach(async () => {
    dir = path.join(await mkdtemp(path.join(tmpdir(), 'fs-store-')), 'reports')
  })

  afterEach(async () => {
    await rm(path.dirname(dir), { recursive: true, force: true })
  })

  it('keeps a report and its metadata, and deletes both with the right hash', async () => {
    const store = createFsStore(dir)
    await store.put(ID, new Uint8Array([1, 2, 3]), { deleteHash: HASH, createdAt: 1 })
    expect((await readdir(dir)).toSorted()).toEqual([`${ID}.age`, `${ID}.json`])
    if (process.platform !== 'win32') expect((await stat(path.join(dir, `${ID}.age`))).mode & 0o777).toBe(0o600)
    expect(await store.remove(ID, OTHER_HASH)).toBe('forbidden')
    expect(await store.remove(ID, HASH)).toBe('deleted')
    expect(await readdir(dir)).toEqual([])
    expect(await store.remove(ID, HASH)).toBe('missing')
  })

  it('deletes old reports, files that a stopped write left, and metadata without a report', async () => {
    const store = createFsStore(dir)
    const newId = 'd'.repeat(32)
    await store.put(ID, new Uint8Array([1]), { deleteHash: HASH, createdAt: 1000 })
    await store.put(newId, new Uint8Array([1]), { deleteHash: HASH, createdAt: 3000 })
    await writeFile(path.join(dir, `${ID}.age.tmp-0000`), 'partial')
    await writeFile(path.join(dir, `${'e'.repeat(32)}.json`), '{}')
    await writeFile(path.join(dir, 'notes.txt'), 'kept')
    expect(await store.sweep(2000)).toBe(1)
    expect((await readdir(dir)).toSorted()).toEqual([`${newId}.age`, `${newId}.json`, 'notes.txt'])
  })

  it('uses the file time of a report without metadata', async () => {
    const store = createFsStore(dir)
    await store.put(ID, new Uint8Array([1]), { deleteHash: HASH, createdAt: Date.now() })
    await rm(path.join(dir, `${ID}.json`))
    const old = new Date(Date.now() - 10_000)
    await utimes(path.join(dir, `${ID}.age`), old, old)
    expect(await store.sweep(Date.now() - 20_000)).toBe(0)
    expect(await store.sweep(Date.now() - 5000)).toBe(1)
  })

  it('finds nothing to delete in a folder that does not exist', async () => {
    expect(await createFsStore(dir).sweep(Date.now())).toBe(0)
  })
})
