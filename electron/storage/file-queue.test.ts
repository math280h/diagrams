import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFileQueue, TrashError, writeFileAtomic } from './file-queue'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, writeFile: vi.fn(actual.writeFile), rename: vi.fn(actual.rename) }
})

const noSpace = () => Object.assign(new Error('No space left on the disk.'), { code: 'ENOSPC' })

let folder: string

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'file-queue-'))
})

afterEach(() => {
  vi.mocked(fsPromises.writeFile).mockReset()
  vi.mocked(fsPromises.rename).mockReset()
  rmSync(folder, { recursive: true, force: true })
})

async function failWriteAfterPart() {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  vi.mocked(fsPromises.writeFile).mockImplementationOnce(async (file) => {
    await actual.writeFile(file, 'part')
    throw noSpace()
  })
}

function queueWith(trash: (file: string) => Promise<void>) {
  const pathOf = (id: string) => path.join(folder, `${id}.json`)
  const queue = createFileQueue({
    pathOf,
    accepts: () => true,
    prepare: async (file) => {
      await fsPromises.mkdir(path.dirname(file), { recursive: true })
    },
    trash,
  })
  return { queue, pathOf }
}

describe('createFileQueue write', () => {
  const noTrash = async () => undefined

  it('removes the part of a write that fails and keeps the old file', async () => {
    const { queue, pathOf } = queueWith(noTrash)
    await queue.write('one', 'old')
    await failWriteAfterPart()
    await expect(queue.write('one', 'new')).rejects.toMatchObject({ code: 'ENOSPC' })
    expect(readdirSync(folder)).toEqual(['one.json'])
    expect(readFileSync(pathOf('one'), 'utf8')).toBe('old')
    expect(await queue.inspect('one')).toBeNull()
  })

  it('removes the temporary file when the rename fails', async () => {
    const { queue } = queueWith(noTrash)
    vi.mocked(fsPromises.rename).mockRejectedValueOnce(noSpace())
    await expect(queue.write('one', 'text')).rejects.toMatchObject({ code: 'ENOSPC' })
    expect(readdirSync(folder)).toEqual([])
    expect(queue.knows('one')).toBe(false)
  })
})

describe('writeFileAtomic', () => {
  it('removes the part of a write that fails', async () => {
    const file = path.join(folder, 'copy.json')
    writeFileSync(file, 'old')
    await failWriteAfterPart()
    await expect(writeFileAtomic(file, 'new')).rejects.toMatchObject({ code: 'ENOSPC' })
    expect(readdirSync(folder)).toEqual(['copy.json'])
    expect(readFileSync(file, 'utf8')).toBe('old')
  })

  it('removes the temporary file when the rename fails', async () => {
    const file = path.join(folder, 'copy.json')
    vi.mocked(fsPromises.rename).mockRejectedValueOnce(noSpace())
    await expect(writeFileAtomic(file, 'new')).rejects.toMatchObject({ code: 'ENOSPC' })
    expect(readdirSync(folder)).toEqual([])
  })
})

describe('createFileQueue remove', () => {
  it('keeps the file when the trash fails', async () => {
    const { queue, pathOf } = queueWith(async () => {
      throw new Error('This drive has no trash.')
    })
    await queue.write('one', 'text')
    const removed = queue.remove('one', true)
    await expect(removed).rejects.toBeInstanceOf(TrashError)
    await expect(removed).rejects.toThrow('This drive has no trash.')
    expect(readFileSync(pathOf('one'), 'utf8')).toBe('text')
    expect(queue.knows('one')).toBe(true)
    expect(await queue.inspect('one')).toBeNull()
  })

  it('counts a failed trash as a remove when the file is gone', async () => {
    const { queue, pathOf } = queueWith(async (file) => {
      rmSync(file)
      throw new Error('The trash reported an error.')
    })
    await queue.write('one', 'text')
    await queue.remove('one', true)
    expect(existsSync(pathOf('one'))).toBe(false)
    expect(queue.knows('one')).toBe(false)
  })

  it('deletes the file without the trash when the remove asks for it', async () => {
    const trash = vi.fn(async () => {
      throw new Error('This drive has no trash.')
    })
    const { queue, pathOf } = queueWith(trash)
    await queue.write('one', 'text')
    await queue.remove('one', false)
    expect(trash).not.toHaveBeenCalled()
    expect(existsSync(pathOf('one'))).toBe(false)
  })

  it('removes a file that is already gone', async () => {
    const { queue } = queueWith(async () => {
      throw Object.assign(new Error('No such file.'), { code: 'ENOENT' })
    })
    await expect(queue.remove('missing', true)).resolves.toBeUndefined()
    await expect(queue.remove('missing', false)).resolves.toBeUndefined()
  })
})
