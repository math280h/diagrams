import type { StoredFile } from '@/desktop/contract'
import { createCachedRepository, type CachedRepository } from '@/persistence/cached-repository'
import { idOfFile } from '@/persistence/diagram-file-name'

export interface FollowedFolder {
  name: string
  repository: CachedRepository
  /**
   * Reads the files again and gives each change to the repository as a change from outside.
   *
   * @returns The ids of the files that the browser could not read again. Their diagrams stay as they were.
   */
  poll(): Promise<string[]>
}

/**
 * Reads the diagram files at the top of a folder that the user picked with a file input. Saves of the repository go
 * nowhere. The list of files stays as it was at the pick.
 *
 * @returns `null` if the input gave no files, because the folder is empty.
 */
export async function readFollowedFolder(files: readonly File[]): Promise<FollowedFolder | null> {
  const name = files[0]?.webkitRelativePath.split('/')[0]
  if (!name) return null
  const diagrams = files.flatMap((file) => {
    const id = file.webkitRelativePath.split('/').length === 2 ? idOfFile(file.name) : null
    return id === null ? [] : [{ id, file }]
  })
  const last = new Map<string, string>()
  const stored: StoredFile[] = []
  for (const { id, file } of diagrams) {
    const text = await file.text()
    last.set(id, text)
    stored.push({ id, text })
  }
  const repository = createCachedRepository({
    location: { kind: 'followed-folder', name },
    files: stored,
    sink: { write: async () => undefined, remove: async () => undefined },
  })
  return {
    name,
    repository,
    async poll() {
      const unreadable: string[] = []
      for (const { id, file } of diagrams) {
        // Firefox reads a picked file from the disk at each read, so a later read gives the new content.
        const text = await file.text().catch(() => null)
        if (text === null) {
          unreadable.push(id)
        } else if (last.get(id) !== text) {
          last.set(id, text)
          repository.applyExternal({ kind: 'changed', id, text })
        }
      }
      return unreadable
    },
  }
}
