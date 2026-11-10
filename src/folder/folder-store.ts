import { toast } from 'sonner'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { useAgentStore } from '@/desktop/agent-store'
import { errorMessage } from '@/lib/error-message'
import { openFolderSession, type FolderSession } from './folder-session'
import { forgetFolder, rememberedFolder, rememberFolder } from './handle-store'

/**
 * The state of the folder on the website.
 *
 * - `none`: the diagrams are in this browser.
 * - `open`: the diagrams are the files in the folder.
 * - `needs-permission`: the browser asks again before the website may use the folder of the last visit.
 * - `missing`: the folder of the last visit is gone or cannot be read.
 * - `following`: the diagrams are the files of a folder that this browser can only read, until a reload.
 */
export type FolderStatus = 'none' | 'open' | 'needs-permission' | 'missing' | 'following'

interface FolderState {
  status: FolderStatus
  name: string | null
  /** Why the folder cannot be read, or `null`. */
  problem: string | null
}

export const useFolderStore = create<FolderState>(() => ({ status: 'none', name: null, problem: null }))

interface FolderSettings {
  /** If true, agents can work through the files in `.diagrams` of the open folder. */
  agents: boolean
}

export const useFolderSettings = create<FolderSettings>()(
  persist((): FolderSettings => ({ agents: false }), {
    name: 'dg:folder-settings',
    storage: createJSONStorage(() => localStorage),
  }),
)

const SHOW_AGENT_STEPS_KEY = 'dg:show-agent-steps'

let session: FolderSession | null = null

export function folderSession(): FolderSession | null {
  return session
}

/** Opens the folder of the last visit, if the browser still allows it. Call it before the app renders. */
export async function restoreFolder(): Promise<FolderSession | null> {
  const handle = await rememberedFolder()
  if (!handle) return null
  const name = handle.name
  try {
    if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
      useFolderStore.setState({ status: 'needs-permission', name })
      return null
    }
    session = await openFolderSession(handle)
  } catch (error) {
    useFolderStore.setState({ status: 'missing', name, problem: errorMessage(error) })
    return null
  }
  session.onProblem((problem) => useFolderStore.setState({ problem }))
  useFolderStore.setState({ status: 'open', name, problem: null })
  if (sessionStorage.getItem(SHOW_AGENT_STEPS_KEY)) {
    sessionStorage.removeItem(SHOW_AGENT_STEPS_KEY)
    useAgentStore.setState({ dialogOpen: true })
  }
  return session
}

/** Runs the agent channel of the open folder while the setting is on. */
export function followAgentSetting(open: FolderSession) {
  let stop: (() => void) | null = null
  let wanted = false
  const apply = (agents: boolean) => {
    wanted = agents
    if (!agents) {
      stop?.()
      stop = null
      return
    }
    if (stop) return
    stop = () => undefined
    void import('./agent-channel').then(({ startAgentChannel }) => {
      if (!wanted) return
      stop = startAgentChannel(open, { onProblem: (problem) => useFolderStore.setState({ problem }) })
    })
  }
  apply(useFolderSettings.getState().agents)
  useFolderSettings.subscribe((state) => apply(state.agents))
}

function reload() {
  window.location.reload()
}

/**
 * Asks the user for a folder and opens it after a reload. The diagrams in this browser stay, and show again after
 * {@link closeFolder}.
 */
export async function pickFolder(options: { agents?: boolean } = {}) {
  let handle: FileSystemDirectoryHandle
  try {
    handle = await window.showDirectoryPicker({ id: 'diagrams', mode: 'readwrite' })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    toast.error('Could not open the folder.', { description: errorMessage(error) })
    return
  }
  await rememberFolder(handle)
  if (options.agents !== undefined) useFolderSettings.setState({ agents: options.agents })
  if (options.agents) sessionStorage.setItem(SHOW_AGENT_STEPS_KEY, 'true')
  reload()
}

/** Asks the browser again for the folder of the last visit. Call it from a click. */
export async function reopenFolder() {
  const handle = await rememberedFolder()
  if (handle && (await handle.requestPermission({ mode: 'readwrite' })) === 'granted') reload()
}

/** Forgets the folder and shows the diagrams in this browser again. The files stay in the folder. */
export async function closeFolder() {
  await forgetFolder()
  reload()
}
