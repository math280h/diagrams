import { toast } from 'sonner'
import { desktopApi, requestErrorMessage } from './bridge'
import type { LinkedFilesReset } from './contract'

const NOTICE_ID = 'linked-files-reset'
const MISSING_FILES = 'The app could not read the whole list. Use Open file to open the missing diagram files again.'

function showDamagedList() {
  void desktopApi()
    ?.request('files.showDamagedList', null)
    .catch((error: unknown) => toast.error(requestErrorMessage(error)))
}

export function noticeLinkedFilesReset(reset: LinkedFilesReset) {
  toast.warning('The list of opened files was reset', {
    id: NOTICE_ID,
    duration: Infinity,
    description: reset.copyKept ? `${MISSING_FILES} The old list shows where they are.` : MISSING_FILES,
    action: reset.copyKept ? { label: 'Show the old list', onClick: showDamagedList } : undefined,
  })
}
