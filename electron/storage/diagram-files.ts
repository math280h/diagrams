import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DIAGRAM_FILE_SUFFIX } from '@/desktop/constants'
import type { FileChange, StoredFile } from '@/desktop/contract'

const MAX_ID_LENGTH = 200
const SAFE_ID = /^[\p{L}\p{N}_()-][\p{L}\p{N}_ .()-]*$/u
/** Delays before each retry of a rename that another process blocks. */
const RETRY_DELAYS_MS = [20, 50, 100, 200, 400]
const RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES'])

export function isSafeId(id: string) {
  return id.length <= MAX_ID_LENGTH && SAFE_ID.test(id) && !id.endsWith('.') && !id.endsWith(' ')
}

export function isTempFile(name: string) {
  return name.includes(`${DIAGRAM_FILE_SUFFIX}.tmp-`)
}

/**
 * Returns the diagram id of a file name.
 *
 * @returns The id, or `null` if the name is not a diagram file.
 */
export function idOfFile(name: string): string | null {
  if (!name.endsWith(DIAGRAM_FILE_SUFFIX)) return null
  const id = name.slice(0, -DIAGRAM_FILE_SUFFIX.length)
  return isSafeId(id) ? id : null
}

function digest(text: string) {
  return createHash('sha256').update(text).digest('hex')
}

function errorCode(error: unknown) {
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

type Operation = { kind: 'write'; text: string } | { kind: 'remove' }

export type DiagramFiles = ReturnType<typeof createDiagramFiles>

interface KnownFile {
  digest: string
  size: number
  mtimeMs: number
}

/**
 * Reads and writes diagram files in one folder.
 *
 * Writes are atomic. Each id keeps only its last change that the app did not write yet. {@link DiagramFiles.inspect}
 * compares each file with the digest, size and change time of the last write or remove that succeeded. A write that
 * fails does not change these values.
 */
export function createDiagramFiles(folder: string, options: { trash?: (file: string) => Promise<void> } = {}) {
  const known = new Map<string, KnownFile>()
  const sequence = new Map<string, number>()
  const chains = new Map<string, Promise<void>>()
  let folderReady: Promise<unknown> | null = null

  const pathOf = (id: string) => path.join(folder, `${id}${DIAGRAM_FILE_SUFFIX}`)
  const ensureFolder = () => {
    folderReady ??= mkdir(folder, { recursive: true }).catch((error: unknown) => {
      folderReady = null
      throw error
    })
    return folderReady
  }
  const remember = async (id: string, text: string) => {
    const info = await stat(pathOf(id))
    known.set(id, { digest: digest(text), size: info.size, mtimeMs: info.mtimeMs })
  }

  async function writeTemp(temp: string, text: string) {
    await ensureFolder()
    try {
      await writeFile(temp, text, 'utf8')
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error
      folderReady = null
      await ensureFolder()
      await writeFile(temp, text, 'utf8')
    }
  }

  async function perform(id: string, operation: Operation) {
    const target = pathOf(id)
    if (operation.kind === 'remove') {
      try {
        if (options.trash) await options.trash(target)
        else await unlink(target)
      } catch (error) {
        if (errorCode(error) !== 'ENOENT') {
          if (!options.trash) throw error
          await unlink(target)
        }
      }
      known.delete(id)
      return
    }
    const temp = `${target}.tmp-${randomBytes(4).toString('hex')}`
    await writeTemp(temp, operation.text)
    try {
      await withRetry(() => rename(temp, target))
    } catch (error) {
      await rm(temp, { force: true })
      throw error
    }
    await remember(id, operation.text)
  }

  function enqueue(id: string, operation: Operation): Promise<void> {
    if (!isSafeId(id)) return Promise.reject(new Error(`"${id}" is not a valid diagram id.`))
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
    let text: string
    try {
      const info = await stat(pathOf(id))
      if (current && info.size === current.size && info.mtimeMs === current.mtimeMs) return null
      text = await readFile(pathOf(id), 'utf8')
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
    folder,

    async readAll(): Promise<StoredFile[]> {
      await ensureFolder()
      const ids = (await readdir(folder)).map(idOfFile).filter((id): id is string => id !== null)
      const files = await Promise.all(
        ids.map(async (id): Promise<StoredFile | null> => {
          try {
            const text = await readFile(pathOf(id), 'utf8')
            await remember(id, text)
            return { id, text }
          } catch {
            return null
          }
        }),
      )
      return files.filter((file): file is StoredFile => file !== null)
    },

    write: (id: string, text: string) => enqueue(id, { kind: 'write', text }),

    remove: (id: string) => enqueue(id, { kind: 'remove' }),

    /** Resolves when all queued writes and removes end. */
    async drain() {
      await Promise.all([...chains.values()].map((chain) => chain.catch(() => undefined)))
    },

    inspect,

    /** Checks the whole folder again and returns every change since the last check. */
    async rescan(): Promise<FileChange[]> {
      let names: string[]
      try {
        names = await readdir(folder)
      } catch {
        return []
      }
      const ids = new Set([...names.map(idOfFile).filter((id): id is string => id !== null), ...known.keys()])
      const changes = await Promise.all([...ids].map(inspect))
      return changes.filter((change): change is FileChange => change !== null)
    },
  }
}
