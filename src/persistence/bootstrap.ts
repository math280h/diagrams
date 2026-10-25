import { desktopApi } from '@/desktop/bridge'
import { startLibrary } from '@/store/library-store'
import { setRepository } from './active-repository'
import { createCachedRepository } from './cached-repository'
import { watchSaveOutcomes } from './storage-copy'

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
        remove: (id) => desktop.request('files.remove', { id }),
      },
    })
    desktop.on('files.changed', (change) => folderRepository.applyExternal(change))
    setRepository(folderRepository)
  }
  watchSaveOutcomes()
  startLibrary()
}
