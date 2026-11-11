import { reportError } from '@/store/problem-store'
import { repository } from './active-repository'
import type { StorageLocation } from './repository'
import { createSaveReporter } from './save-reporter'

export interface StorageCopy {
  promise: string
  saveFailed: string
  changedElsewhere: string
  removedElsewhere: string
  missingTitle: string
  missingDetail: string
  stillSaved: string
  deleteDetail: string
  removeFailed: string
  /** Where the version history keeps its versions, to end a sentence. */
  versionsPlace: string
}

const BROWSER_COPY: StorageCopy = {
  promise: 'Your diagrams are stored only on your computer. No account needed.',
  saveFailed: 'Could not save the diagram to this browser.',
  changedElsewhere: 'This diagram changed in another tab.',
  removedElsewhere: 'This diagram was deleted in another tab.',
  missingTitle: 'This diagram does not exist in this browser',
  missingDetail: 'Diagrams stay in the browser where you made them. Import the diagram file to open it here.',
  stillSaved: 'Your saved diagrams are still in this browser.',
  deleteDetail: 'This removes the diagram and its flows from this browser. You cannot undo it.',
  removeFailed: 'Could not delete the diagram from this browser.',
  versionsPlace: 'in this browser',
}

const FOLDER_COPY: StorageCopy = {
  promise: 'Your diagrams are stored only as files on this computer. No account needed.',
  saveFailed: 'Could not save the diagram file.',
  changedElsewhere: 'This diagram changed on disk.',
  removedElsewhere: 'The file of this diagram was deleted or moved.',
  missingTitle: 'This diagram is not in your diagrams folder',
  missingDetail: 'Someone moved or deleted the file. Import the diagram file to open it here.',
  stillSaved: 'Your saved diagrams are still in your diagrams folder.',
  deleteDetail: 'This moves the diagram file to the trash.',
  removeFailed: 'Could not move the diagram file to the trash.',
  versionsPlace: 'on this computer',
}

const PICKED_FOLDER_COPY: StorageCopy = {
  ...FOLDER_COPY,
  missingTitle: 'This diagram is not in the open folder',
  stillSaved: 'Your saved diagrams are still in the open folder.',
  deleteDetail: 'This moves the diagram file to .diagrams/deleted in the folder, where you can get it back.',
  removeFailed: 'Could not delete the diagram file.',
}

const FOLLOWED_FOLDER_COPY: StorageCopy = {
  promise: 'This browser shows the folder only to read. Your changes here stay in this tab.',
  saveFailed: 'Could not keep the change in this tab.',
  changedElsewhere: 'This diagram changed in the folder.',
  removedElsewhere: 'The file of this diagram was deleted or moved.',
  missingTitle: 'This diagram is not in the folder',
  missingDetail: 'Choose the folder again to see the files that are new in it.',
  stillSaved: 'The files in the folder did not change.',
  deleteDetail: 'This removes the diagram from this tab. The file stays in the folder.',
  removeFailed: 'Could not remove the diagram from this tab.',
  versionsPlace: 'in this browser',
}

const COPIES: Record<StorageLocation['kind'], StorageCopy> = {
  browser: BROWSER_COPY,
  folder: FOLDER_COPY,
  'picked-folder': PICKED_FOLDER_COPY,
  'followed-folder': FOLLOWED_FOLDER_COPY,
}

export function storageCopy(): StorageCopy {
  return COPIES[repository().location.kind]
}

const SAVE_FAILED_TOAST = 'save-failed'

/**
 * Shows failed saves and removes of the repository as toasts, for as long as the app runs.
 *
 * @returns A function that stops it.
 */
export function watchSaveOutcomes(): () => void {
  return repository().subscribe(
    createSaveReporter({
      saveFailed: (event) =>
        reportError(
          event.reason === 'quota'
            ? 'Browser storage is full, so changes stay in this tab only.'
            : storageCopy().saveFailed,
          event.message,
          {
            id: SAVE_FAILED_TOAST,
            description:
              event.reason === 'quota'
                ? 'Choose Export, then Diagram file (JSON), before you close the tab. Delete other diagrams to free space.'
                : 'Choose Export, then Diagram file (JSON), to keep your changes.',
            duration: 12_000,
            facts: [`Storage: ${repository().location.kind}`, `Save failure: ${event.reason}`, `Diagram: ${event.id}`],
          },
        ),
      removeFailed: (event) =>
        reportError(storageCopy().removeFailed, event.message, {
          facts: [`Storage: ${repository().location.kind}`, `Diagram: ${event.id}`],
        }),
    }),
  )
}
