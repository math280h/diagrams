import { desktopApi } from '@/desktop/bridge'
import { noticeLinkedFilesReset } from '@/desktop/linked-files-notice'
import { followAgentSetting, restoreFolder } from '@/folder/folder-store'
import { canOpenFolder } from '@/folder/support'
import { startLibrary } from '@/store/library-store'
import { repository, setRepository } from './active-repository'
import { askForPersistentStorageOnSave } from './persistent-storage'
import type { StoredFile } from '@/desktop/contract'
import { createCachedRepository, type CachedRepository } from './cached-repository'
import { TrashError, type DiagramRepository } from './repository'
import { watchSaveOutcomes } from './storage-copy'

let desktopRepository: CachedRepository | null = null
let stopSaveOutcomes: (() => void) | null = null

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
    const { folder, files, linkedFilesReset } = await desktop.request('files.list', null)
    if (linkedFilesReset) noticeLinkedFilesReset(linkedFilesReset)
    const folderRepository = createCachedRepository({
      location: { kind: 'folder', path: folder },
      files,
      sink: {
        write: (file) => desktop.request('files.write', file),
        remove: async (id, trash) => {
          const outcome = await desktop.request('files.remove', { id, trash })
          if (outcome.kind === 'trash-failed') throw new TrashError(outcome.message)
        },
      },
    })
    desktop.on('files.changed', (change) => folderRepository.applyExternal(change))
    desktopRepository = folderRepository
    setRepository(folderRepository)
  } else if (canOpenFolder()) {
    const folder = await restoreFolder()
    if (folder) {
      setRepository(folder.repository)
      followAgentSetting(folder)
    }
  }
  stopSaveOutcomes = watchSaveOutcomes()
  if (repository().location.kind === 'browser') askForPersistentStorageOnSave()
  startLibrary()
}

/** Replaces the repository while the app runs. Close the open diagram first: its session keeps the old repository. */
export function switchRepository(next: DiagramRepository) {
  stopSaveOutcomes?.()
  setRepository(next)
  stopSaveOutcomes = watchSaveOutcomes()
  startLibrary()
}
