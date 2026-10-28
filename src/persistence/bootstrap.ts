import { desktopApi } from '@/desktop/bridge'
import { startLibrary } from '@/store/library-store'
import { setRepository } from './active-repository'
import type { StoredFile } from '@/desktop/contract'
import { createCachedRepository, type CachedRepository } from './cached-repository'
import { watchSaveOutcomes } from './storage-copy'

let desktopRepository: CachedRepository | null = null

/** Adds diagram files that the main process linked, such as files that the user opened, to the diagram list. */
export function takeLinkedFiles(files: readonly StoredFile[]) {
  for (const file of files) {
    desktopRepository?.applyExternal({ kind: 'changed', id: file.id, text: file.text, path: file.path })
  }
}

/** Chooses the repository of this build and loads the diagram list. Call it before the app renders. */
export async function bootstrapStorage() {
  const desktop = desktopApi()
  if (desktop) {
    const { folder, files } = await desktop.request('files.list', null)
    const folderRepository = createCachedRepository({
      location: { kind: 'folder', path: folder },
      files,
      sink: {
        write: (file) => desktop.request('files.write', file),
        remove: (id, trash) => desktop.request('files.remove', { id, trash }),
      },
    })
    desktop.on('files.changed', (change) => folderRepository.applyExternal(change))
    desktopRepository = folderRepository
    setRepository(folderRepository)
  }
  watchSaveOutcomes()
  startLibrary()
}
