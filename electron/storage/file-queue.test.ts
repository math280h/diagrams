import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFileQueue, TrashError } from './file-queue'

let folder: string

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'file-queue-'))
})

afterEach(() => {
  rmSync(folder, { recursive: true, force: true })
})

function queueWith(trash: (file: string) => Promise<void>) {
  const pathOf = (id: string) => path.join(folder, `${id}.json`)
  const queue = createFileQueue({
    pathOf,
    accepts: () => true,
    prepare: async (file) => {
      await mkdir(path.dirname(file), { recursive: true })
    },
    trash,
  })
  return { queue, pathOf }
}

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
