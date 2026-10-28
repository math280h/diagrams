import { mkdir, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { DIAGRAM_FILE_SUFFIX } from '@/desktop/constants'
import type { FileChange, StoredFile } from '@/desktop/contract'
import { createFileQueue } from './file-queue'

const MAX_ID_LENGTH = 200
const SAFE_ID = /^[\p{L}\p{N}_()-][\p{L}\p{N}_ .()-]*$/u

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

export type DiagramFiles = ReturnType<typeof createDiagramFiles>

/**
 * Reads and writes diagram files in one folder.
 *
 * Writes are atomic. Each id keeps only its last change that the app did not write yet. {@link DiagramFiles.inspect}
 * compares each file with the digest, size and change time of the last write or remove that succeeded. A write that
 * fails does not change these values.
 */
export function createDiagramFiles(folder: string, options: { trash?: (file: string) => Promise<void> } = {}) {
  let folderReady: Promise<unknown> | null = null
  const pathOf = (id: string) => path.join(folder, `${id}${DIAGRAM_FILE_SUFFIX}`)
  const ensureFolder = () => {
    folderReady ??= mkdir(folder, { recursive: true }).catch((error: unknown) => {
      folderReady = null
      throw error
    })
    return folderReady
  }
  const queue = createFileQueue({
    pathOf,
    accepts: isSafeId,
    prepare: async (_file, retry) => {
      if (retry) folderReady = null
      await ensureFolder()
    },
    trash: options.trash,
  })

  return {
    folder,

    async readAll(): Promise<StoredFile[]> {
      await queue.drain()
      await ensureFolder()
      const ids = (await readdir(folder)).map(idOfFile).filter((id): id is string => id !== null)
      const files = await Promise.all(
        ids.map(async (id): Promise<StoredFile | null> => {
          try {
            const text = await readFile(pathOf(id), 'utf8')
            await queue.remember(id, text)
            return { id, text }
          } catch {
            return null
          }
        }),
      )
      return files.filter((file): file is StoredFile => file !== null)
    },

    write: queue.write,

    remove: (id: string, { trash = true }: { trash?: boolean } = {}) => queue.remove(id, trash),

    drain: queue.drain,

    inspect: queue.inspect,

    /** Checks the whole folder again and returns every change since the last check. */
    async rescan(): Promise<FileChange[]> {
      let names: string[]
      try {
        names = await readdir(folder)
      } catch {
        return []
      }
      const ids = new Set([...names.map(idOfFile).filter((id): id is string => id !== null), ...queue.knownIds()])
      const changes = await Promise.all([...ids].map(queue.inspect))
      return changes.filter((change): change is FileChange => change !== null)
    },
  }
}
