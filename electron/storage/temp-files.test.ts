import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  removeStaleTempFiles,
  removeStaleTempFilesOf,
  STALE_TEMP_AGE_MS,
  targetOfTempName,
  tempFileOf,
  writeThroughTemp,
} from './temp-files'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, rm: vi.fn(actual.rm) }
})

const NOW_MS = Date.UTC(2026, 0, 1)

const noSpace = () => Object.assign(new Error('No space left on the disk.'), { code: 'ENOSPC' })

let folder: string

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'temp-files-'))
})

afterEach(() => {
  vi.mocked(fsPromises.rm).mockReset()
  rmSync(folder, { recursive: true, force: true })
})

function fileWithAge(name: string, ageMs: number) {
  const file = path.join(folder, name)
  writeFileSync(file, 'part')
  const time = new Date(NOW_MS - ageMs)
  utimesSync(file, time, time)
  return file
}

describe('temporary file names', () => {
  it('gives each write a new name that leads back to the file', () => {
    const file = path.join(folder, 'orders.diagram.json')
    const first = tempFileOf(file)
    expect(first).not.toBe(tempFileOf(file))
    expect(path.basename(first)).toMatch(/^orders\.diagram\.json\.tmp-[0-9a-f]{8}$/)
    expect(targetOfTempName(path.basename(first))).toBe('orders.diagram.json')
  })

  it('accepts only the names that this app makes', () => {
    expect(targetOfTempName('a.json.tmp-0a1b2c3d')).toBe('a.json')
    expect(targetOfTempName('a.tmp-00000000.json.tmp-ffffffff')).toBe('a.tmp-00000000.json')
    expect(targetOfTempName('a.json.tmp-0000')).toBeNull()
    expect(targetOfTempName('a.json.tmp-0a1b2c3d4')).toBeNull()
    expect(targetOfTempName('a.json.tmp-0A1B2C3D')).toBeNull()
    expect(targetOfTempName('a.json.tmp-0a1b2c3g')).toBeNull()
    expect(targetOfTempName('a.json.tmp-0a1b2c3d.bak')).toBeNull()
    expect(targetOfTempName('.tmp-0a1b2c3d')).toBeNull()
    expect(targetOfTempName('a.json.tmp')).toBeNull()
    expect(targetOfTempName('a.json')).toBeNull()
  })
})

describe('writeThroughTemp', () => {
  const target = () => path.join(folder, 'one.json')

  it('leaves only the file after a write', async () => {
    await writeThroughTemp(target(), async (temp) => {
      await fsPromises.writeFile(temp, 'text')
      await fsPromises.rename(temp, target())
    })
    expect(readdirSync(folder)).toEqual(['one.json'])
    expect(readFileSync(target(), 'utf8')).toBe('text')
  })

  it('removes the part of a write that fails and throws its error', async () => {
    const error = noSpace()
    const written = writeThroughTemp(target(), async (temp) => {
      await fsPromises.writeFile(temp, 'part')
      throw error
    })
    await expect(written).rejects.toBe(error)
    expect(readdirSync(folder)).toEqual([])
  })

  it('removes the temporary file when the rename fails', async () => {
    writeFileSync(target(), 'old')
    const error = Object.assign(new Error('The rename failed.'), { code: 'EXDEV' })
    const written = writeThroughTemp(target(), async (temp) => {
      await fsPromises.writeFile(temp, 'new')
      throw error
    })
    await expect(written).rejects.toBe(error)
    expect(readdirSync(folder)).toEqual(['one.json'])
    expect(readFileSync(target(), 'utf8')).toBe('old')
  })

  it('throws the error of the write when the removal also fails', async () => {
    vi.mocked(fsPromises.rm).mockRejectedValueOnce(Object.assign(new Error('The file is in use.'), { code: 'EBUSY' }))
    const error = noSpace()
    const written = writeThroughTemp(target(), async () => {
      throw error
    })
    await expect(written).rejects.toBe(error)
    expect(fsPromises.rm).toHaveBeenCalledOnce()
  })
})

describe('removeStaleTempFiles', () => {
  const all = () => readdirSync(folder)

  it('removes a temporary file only from the minimum age on', async () => {
    fileWithAge('a.json.tmp-00000001', STALE_TEMP_AGE_MS + 1)
    fileWithAge('a.json.tmp-00000002', STALE_TEMP_AGE_MS)
    fileWithAge('a.json.tmp-00000003', STALE_TEMP_AGE_MS - 1000)
    fileWithAge('a.json.tmp-00000004', -STALE_TEMP_AGE_MS)
    const removed = await removeStaleTempFiles(folder, all(), () => true, NOW_MS)
    expect(removed.toSorted()).toEqual(['a.json.tmp-00000001', 'a.json.tmp-00000002'])
    expect(all().toSorted()).toEqual(['a.json.tmp-00000003', 'a.json.tmp-00000004'])
  })

  it('keeps old files that do not have the name of a temporary file of an accepted target', async () => {
    const old = STALE_TEMP_AGE_MS * 2
    const kept = ['a.json', 'a.json.tmp-0000', 'a.json.tmp-0a1b2c3d.bak', 'b.json.tmp-0a1b2c3d', 'xa.json.tmp-0a1b2c3d']
    for (const name of kept) fileWithAge(name, old)
    fileWithAge('a.json.tmp-0a1b2c3d', old)
    await removeStaleTempFiles(folder, all(), (name) => name === 'a.json', NOW_MS)
    expect(all().toSorted()).toEqual(kept.toSorted())
  })

  it('keeps a folder with the name of a temporary file', async () => {
    const inner = path.join(folder, 'a.json.tmp-0a1b2c3d')
    mkdirSync(inner)
    const time = new Date(NOW_MS - STALE_TEMP_AGE_MS * 2)
    utimesSync(inner, time, time)
    expect(await removeStaleTempFiles(folder, all(), () => true, NOW_MS)).toEqual([])
    expect(all()).toEqual(['a.json.tmp-0a1b2c3d'])
  })

  it('ignores names that are gone and files that it cannot remove', async () => {
    fileWithAge('a.json.tmp-00000001', STALE_TEMP_AGE_MS * 2)
    fileWithAge('a.json.tmp-00000002', STALE_TEMP_AGE_MS * 2)
    vi.mocked(fsPromises.rm).mockRejectedValueOnce(Object.assign(new Error('The file is in use.'), { code: 'EBUSY' }))
    const removed = await removeStaleTempFiles(folder, [...all().toSorted(), 'a.json.tmp-00000003'], () => true, NOW_MS)
    expect(removed).toHaveLength(1)
    expect(all()).toHaveLength(1)
  })
})

describe('removeStaleTempFilesOf', () => {
  it('removes only the old temporary files of the given files', async () => {
    const old = STALE_TEMP_AGE_MS * 2
    mkdirSync(path.join(folder, 'docs'))
    fileWithAge('docs/orders.diagram.json.tmp-0a1b2c3d', old)
    fileWithAge('docs/notes.diagram.json.tmp-0a1b2c3d', old)
    fileWithAge('settings.json.tmp-0a1b2c3d', old)
    fileWithAge('state.json.tmp-0a1b2c3d', old)
    await removeStaleTempFilesOf(
      [
        path.join(folder, 'docs', 'orders.diagram.json'),
        path.join(folder, 'settings.json'),
        path.join(folder, 'gone', 'x.json'),
      ],
      NOW_MS,
    )
    expect(readdirSync(path.join(folder, 'docs'))).toEqual(['notes.diagram.json.tmp-0a1b2c3d'])
    expect(readdirSync(folder).toSorted()).toEqual(['docs', 'state.json.tmp-0a1b2c3d'])
  })
})
