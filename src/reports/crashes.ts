import { toast } from 'sonner'
import { create } from 'zustand'
import { desktopApi, requestErrorMessage } from '@/desktop/bridge'
import type { CrashRecord } from '@/desktop/contract'
import { crashTitle } from './build'
import { openReport } from './report-store'

/** The crashes that the desktop app keeps, the newest first, or `null` before they load. */
export const useCrashes = create<{ crashes: CrashRecord[] | null }>(() => ({ crashes: null }))

const CRASH_NOTICE_ID = 'crash-notice'

function set(crashes: CrashRecord[]) {
  useCrashes.setState({ crashes })
}

/** Shows the files of a crash dump in the file manager. */
export function showCrashDump(id: string) {
  void desktopApi()
    ?.request('reports.showDump', { id })
    .catch((error: unknown) => toast.error(requestErrorMessage(error)))
}

export async function deleteCrash(id: string) {
  const api = desktopApi()
  if (!api) return
  try {
    set(await api.request('reports.deleteCrash', { id }))
  } catch (error) {
    toast.error('Could not delete the crash', { description: requestErrorMessage(error) })
  }
}

async function noticeNewCrashes(crashes: CrashRecord[]) {
  const api = desktopApi()
  const unseen = crashes.filter((crash) => !crash.seen)
  const crash = unseen.find((candidate) => candidate.process === 'main') ?? unseen[0]
  if (!api || !crash) return
  set(await api.request('reports.markSeen', null))
  toast.error(`${crashTitle(crash)} unexpectedly`, {
    id: `${CRASH_NOTICE_ID}-${crash.id}`,
    duration: Infinity,
    action: { label: 'More details', onClick: () => openReport({ kind: 'crash', crash: { ...crash, seen: true } }) },
  })
}

/**
 * Loads the crashes of the desktop app and follows new ones. For each list with new crashes, it shows one notice: about
 * the crash of the main process, or else about the newest crash. Returns a function that stops it.
 */
export function watchCrashes(): () => void {
  const api = desktopApi()
  if (!api) return () => undefined
  const update = (crashes: CrashRecord[]) => {
    set(crashes)
    void noticeNewCrashes(crashes).catch(() => undefined)
  }
  void api.request('reports.crashes', null).then(update, () => undefined)
  return api.on('reports.crashes', update)
}
