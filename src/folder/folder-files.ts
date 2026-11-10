import type { FileChange, StoredFile } from '@/desktop/contract'
import { fileOfId, idOfFile } from '@/persistence/diagram-file-name'

export type FolderFiles = ReturnType<typeof createFolderFiles>

function isNotFound(error: unknown) {
  return error instanceof DOMException && error.name === 'NotFoundError'
}

/** Writes a text file in a folder. Chrome writes to a swap file and replaces the file when the writer closes. */
export async function writeText(folder: FileSystemDirectoryHandle, name: string, data: string | Blob) {
  const writable = await (await folder.getFileHandle(name, { create: true })).createWritable()
  await writable.write(data)
  await writable.close()
}

export async function removeIfThere(folder: FileSystemDirectoryHandle, name: string) {
  try {
    await folder.removeEntry(name)
  } catch (error) {
    if (!isNotFound(error)) throw error
  }
}

/**
 * Reads and writes the diagram files of a folder that the user picked. The id of a diagram is its file name.
 *
 * It keeps the last text that the app read or wrote for each file, so {@link FolderFiles.changes} reports only changes
 * from outside. Writes and removes of one id run in order.
 *
 * A write does not replace a file that changed from outside since the app last read or wrote it, for example by an
 * agent between two folder scans. It gives that change to `onOutsideChange` instead.
 */
export function createFolderFiles(
  folder: FileSystemDirectoryHandle,
  onOutsideChange: (change: FileChange) => void = () => undefined,
) {
  const known = new Map<string, string>()
  const chains = new Map<string, Promise<unknown>>()

  const inOrder = <T>(id: string, work: () => Promise<T>): Promise<T> => {
    const next = (chains.get(id) ?? Promise.resolve()).then(work, work)
    chains.set(
      id,
      next.catch(() => undefined),
    )
    return next
  }

  const read = async (name: string): Promise<string | null> => {
    try {
      return await (await (await folder.getFileHandle(name)).getFile()).text()
    } catch (error) {
      if (isNotFound(error)) return null
      throw error
    }
  }

  return {
    name: folder.name,

    async list(): Promise<StoredFile[]> {
      const files: StoredFile[] = []
      for await (const [name, handle] of folder.entries()) {
        const id = handle.kind === 'file' ? idOfFile(name) : null
        if (id === null) continue
        const text = await read(name)
        if (text === null) continue
        known.set(id, text)
        files.push({ id, text })
      }
      return files
    },

    write(file: StoredFile): Promise<void> {
      return inOrder(file.id, async () => {
        const name = fileOfId(file.id)
        const before = known.get(file.id)
        const current = before === undefined ? null : await read(name)
        if (current !== null && current !== before) {
          known.set(file.id, current)
          onOutsideChange({ kind: 'changed', id: file.id, text: current })
          return
        }
        await writeText(folder, name, file.text)
        known.set(file.id, file.text)
      })
    },

    remove(id: string): Promise<void> {
      return inOrder(id, async () => {
        await removeIfThere(folder, fileOfId(id))
        known.delete(id)
      })
    },

    /**
     * Reads the named files and returns the changes that the app did not make.
     *
     * @param names - File names that changed or went away, for example from a folder scan.
     */
    async changes(names: readonly string[]): Promise<FileChange[]> {
      const found: FileChange[] = []
      for (const name of names) {
        const id = idOfFile(name)
        if (id === null) continue
        await chains.get(id)
        const text = await read(name)
        if (text === null) {
          if (known.delete(id)) found.push({ kind: 'removed', id })
        } else if (known.get(id) !== text) {
          known.set(id, text)
          found.push({ kind: 'changed', id, text })
        }
      }
      return found
    },
  }
}
