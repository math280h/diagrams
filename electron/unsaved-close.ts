import { DIAGRAM_FILE_SUFFIX } from '@/desktop/constants'
import type { UnsavedFile } from '@/desktop/contract'
import { errorMessage } from '@/lib/error-message'

export interface CloseQuestion {
  message: string
  detail: string
  buttons: string[]
  defaultId: number
  cancelId: number
}

/** The dialogs of the question before a window with unsaved changes closes. */
export interface CloseDialogs {
  /** Returns the index of the button that the user chose. */
  ask(question: CloseQuestion): Promise<number>
  /** Returns the file that the user chose, or `null` when the user cancelled. */
  pickFile(defaultName: string): Promise<string | null>
  write(file: string, text: string): Promise<void>
  showError(message: string, detail: string): Promise<void>
}

/** What the window does after the question: it closes, or it reloads its page. */
export type UnsavedAction = 'close' | 'reload'

const SAVE_COPY = 0
const CLOSE = 1
const KEEP_OPEN = 2

const ACTION_BUTTONS: Record<UnsavedAction, [go: string, stay: string]> = {
  close: ['Close without saving', 'Keep the window open'],
  reload: ['Reload without saving', 'Do not reload'],
}

/** Returns a file name for a diagram file, without the characters that file systems refuse. */
export function diagramFileName(name: string) {
  return `${name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Diagram'}${DIAGRAM_FILE_SUFFIX}`
}

/**
 * Asks the user what to do before a window closes or reloads while its diagram has changes that are not in storage.
 * The user can save a copy of the diagram file, continue without saving, or stop. A cancelled or failed copy asks
 * again.
 *
 * @returns True if the window can close or reload.
 */
export async function confirmUnsavedClose(
  unsaved: UnsavedFile,
  dialogs: CloseDialogs,
  action: UnsavedAction = 'close',
): Promise<boolean> {
  for (;;) {
    const answer = await dialogs.ask({
      message: `“${unsaved.name}” is not saved`,
      detail: 'The app could not save your last changes. Save a copy of the diagram file to keep them.',
      buttons: ['Save a copy…', ...ACTION_BUTTONS[action]],
      defaultId: SAVE_COPY,
      cancelId: KEEP_OPEN,
    })
    if (answer === CLOSE) return true
    if (answer !== SAVE_COPY) return false
    const file = await dialogs.pickFile(diagramFileName(unsaved.name))
    if (file === null) continue
    try {
      await dialogs.write(file, unsaved.text)
      return true
    } catch (error) {
      await dialogs.showError('Could not save the copy.', errorMessage(error))
    }
  }
}
