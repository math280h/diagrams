import { mkdir, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { DIAGRAM_FILE_SUFFIX } from '@/desktop/constants'
import type { FileChange, StoredFile } from '@/desktop/contract'
import { idOfFile, isSafeId } from '@/persistence/diagram-file-name'
import { createFileQueue } from './file-queue'
import { removeStaleTempFiles } from './temp-files'

export { idOfFile, isSafeId } from '@/persistence/diagram-file-name'

export function isTempFile(name: string) {
  return name.includes(`${DIAGRAM_FILE_SUFFIX}.tmp-`)
}

const isDiagramFile = (name: string) => idOfFile(name) !== null

export type DiagramFiles = ReturnType<typeof createDiagramFiles>

/**
 * Reads and writes diagram files in one folder.
 *
 * Writes are atomic. Each id keeps only its last change that the app did not write yet. {@link DiagramFiles.inspect}
 * compares each file with the digest, size and change time of the last write or remove that succeeded. A write that
 * fails does not change these values. `readAll` and `rescan` also remove old temporary files of diagram files.
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
      const names = await readdir(folder)
      const ids = names.map(idOfFile).filter((id): id is string => id !== null)
      const [files] = await Promise.all([
        Promise.all(
          ids.map(async (id): Promise<StoredFile | null> => {
            try {
              const text = await readFile(pathOf(id), 'utf8')
              await queue.remember(id, text)
              return { id, text }
            } catch {
              return null
            }
          }),
        ),
        removeStaleTempFiles(folder, names, isDiagramFile),
      ])
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
      const [changes] = await Promise.all([
        Promise.all([...ids].map(queue.inspect)),
        removeStaleTempFiles(folder, names, isDiagramFile),
      ])
      return changes.filter((change): change is FileChange => change !== null)
    },
  }
}
