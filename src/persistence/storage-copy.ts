import { toast } from 'sonner'
import { repository } from './active-repository'
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
  promise: 'Free, no account, and your diagrams stay in this browser.',
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
  promise: 'Free, no account, and your diagrams stay on this computer as files.',
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

export function storageCopy(): StorageCopy {
  return repository().location.kind === 'folder' ? FOLDER_COPY : BROWSER_COPY
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
        toast.error(
          event.reason === 'quota'
            ? 'Browser storage is full, so changes stay in this tab only.'
            : storageCopy().saveFailed,
          {
            id: SAVE_FAILED_TOAST,
            description:
              event.reason === 'quota'
                ? 'Choose Export, then Diagram file (JSON), before you close the tab. Delete other diagrams to free space.'
                : 'Choose Export, then Diagram file (JSON), to keep your changes.',
            duration: 12_000,
          },
        ),
      removeFailed: (event) => toast.error(storageCopy().removeFailed, { description: event.message }),
    }),
  )
}
