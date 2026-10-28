import { createHash, randomBytes } from 'node:crypto'
import { readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import type { FileChange } from '@/desktop/contract'

/** Delays before each retry of a rename that another process blocks. */
const RETRY_DELAYS_MS = [20, 50, 100, 200, 400]
const RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES'])

export function digest(text: string) {
  return createHash('sha256').update(text).digest('hex')
}

export function errorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : null
}

async function withRetry<T>(work: () => Promise<T>): Promise<T> {
  for (const delayMs of RETRY_DELAYS_MS) {
    try {
      return await work()
    } catch (error) {
      if (!RETRY_CODES.has(errorCode(error) ?? '')) throw error
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  return work()
}

type Operation = { kind: 'write'; text: string } | { kind: 'remove'; trash: boolean }

interface KnownFile {
  digest: string
  size: number
  mtimeMs: number
}

export interface FileQueueOptions {
  /** Returns the file of an id. */
  pathOf: (id: string) => string
  /** Returns true if the id may name a file. */
  accepts: (id: string) => boolean
  /** Makes sure that a file can be written. The queue calls it again after a write fails because a folder is gone. */
  prepare: (file: string, retry: boolean) => Promise<void>
  trash?: (file: string) => Promise<void>
}

export type FileQueue = ReturnType<typeof createFileQueue>

/**
 * Writes and removes files one change at a time for each id.
 *
 * Writes are atomic. Each id keeps only its last change that is not written yet. {@link FileQueue.inspect} compares
 * each file with the digest, size and change time of the last write or remove that succeeded. A write that fails does
 * not change these values.
 */
export function createFileQueue(options: FileQueueOptions) {
  const known = new Map<string, KnownFile>()
  const sequence = new Map<string, number>()
  const chains = new Map<string, Promise<void>>()

  const remember = async (id: string, text: string) => {
    const info = await stat(options.pathOf(id))
    known.set(id, { digest: digest(text), size: info.size, mtimeMs: info.mtimeMs })
  }

  async function writeTemp(target: string, temp: string, text: string) {
    await options.prepare(target, false)
    try {
      await writeFile(temp, text, 'utf8')
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error
      await options.prepare(target, true)
      await writeFile(temp, text, 'utf8')
    }
  }

  async function perform(id: string, operation: Operation) {
    const target = options.pathOf(id)
    if (operation.kind === 'remove') {
      const trash = operation.trash ? options.trash : undefined
      try {
        if (trash) await trash(target)
        else await unlink(target)
      } catch (error) {
        if (errorCode(error) !== 'ENOENT') {
          if (!trash) throw error
          await unlink(target)
        }
      }
      known.delete(id)
      return
    }
    const temp = `${target}.tmp-${randomBytes(4).toString('hex')}`
    await writeTemp(target, temp, operation.text)
    try {
      await withRetry(() => rename(temp, target))
    } catch (error) {
      await rm(temp, { force: true })
      throw error
    }
    await remember(id, operation.text)
  }

  function enqueue(id: string, operation: Operation): Promise<void> {
    if (!options.accepts(id)) return Promise.reject(new Error(`"${id}" is not a valid diagram id.`))
    const seq = (sequence.get(id) ?? 0) + 1
    sequence.set(id, seq)
    const previous = chains.get(id) ?? Promise.resolve()
    const run = previous
      .catch(() => undefined)
      .then(() => (sequence.get(id) === seq ? perform(id, operation) : undefined))
    chains.set(id, run)
    void run
      .catch(() => undefined)
      .then(() => {
        if (chains.get(id) === run) chains.delete(id)
      })
    return run
  }

  /**
   * Checks one file again and compares it with what this app knows of it. A file with the known size and change time
   * counts as unchanged without a read.
   *
   * @returns The change, or `null` if the file is as this app wrote it. The result is also `null` if this app starts a
   *   write or remove of the file during the check. The file watcher reports that write. A later call checks the file
   *   again.
   */
  async function inspect(id: string): Promise<FileChange | null> {
    await chains.get(id)?.catch(() => undefined)
    const before = sequence.get(id)
    const current = known.get(id)
    const file = options.pathOf(id)
    let text: string
    try {
      const info = await stat(file)
      if (current && info.size === current.size && info.mtimeMs === current.mtimeMs) return null
      text = await readFile(file, 'utf8')
      if (sequence.get(id) !== before) return null
      const hash = digest(text)
      known.set(id, { digest: hash, size: info.size, mtimeMs: info.mtimeMs })
      if (current?.digest === hash) return null
    } catch (error) {
      if (sequence.get(id) !== before || errorCode(error) !== 'ENOENT' || !known.has(id)) return null
      known.delete(id)
      return { kind: 'removed', id }
    }
    return { kind: 'changed', id, text }
  }

  return {
    remember,
    knows: (id: string) => known.has(id),
    forget: (id: string) => known.delete(id),
    write: (id: string, text: string) => enqueue(id, { kind: 'write', text }),
    remove: (id: string, trash: boolean) => enqueue(id, { kind: 'remove', trash }),
    inspect,
    /** Returns the ids of the files that the queue knows. */
    knownIds: () => [...known.keys()],
    /** Resolves when all queued writes and removes end. */
    drain: async () => {
      await Promise.all([...chains.values()].map((chain) => chain.catch(() => undefined)))
    },
  }
}
