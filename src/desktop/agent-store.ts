import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { desktopApi, isDesktop } from './bridge'
import type { AgentInfo } from './contract'
import { canOpenInApp } from './open-in-app'

interface AgentStore {
  info: AgentInfo | null
  dialogOpen: boolean
}

export const useAgentStore = create<AgentStore>(() => ({ info: null, dialogOpen: false }))

interface AgentHistory {
  /** The time of the last agent tool call in milliseconds since the epoch, or `null` before the first call. */
  lastCallAt: number | null
  /** If true, the user hid the agent introduction on the library. */
  introHidden: boolean
}

export const useAgentHistory = create<AgentHistory>()(
  persist((): AgentHistory => ({ lastCallAt: null, introHidden: false }), {
    name: 'dg:agent-history',
    storage: createJSONStorage(() => localStorage),
  }),
)

export function recordAgentCall() {
  useAgentHistory.setState({ lastCallAt: Date.now() })
}

export function hideAgentIntro() {
  useAgentHistory.setState({ introHidden: true })
}

/**
 * Returns true while the library shows the agent introduction.
 *
 * The desktop app shows it until the first agent call. The website shows it everywhere except on phones. Both hide it
 * permanently when the user closes it.
 */
export function useAgentIntroVisible() {
  return useAgentHistory((state) => !state.introHidden && (isDesktop() ? state.lastCallAt === null : canOpenInApp()))
}

/** Returns true while the agent server cannot take connections. */
export function useAgentProblem() {
  return useAgentStore((store) => store.info?.state === 'port-in-use' || store.info?.state === 'failed')
}

export function openConnectAgent() {
  useAgentStore.setState({ dialogOpen: true })
}

/** Loads the agent server status from the main process and follows its changes. */
export function watchAgentInfo(): () => void {
  const desktop = desktopApi()
  if (!desktop) return () => undefined
  void desktop.request('agent.info', null).then((info) => useAgentStore.setState({ info }))
  return desktop.on('agent.info', (info) => useAgentStore.setState({ info }))
}

export async function resetAgentToken() {
  const desktop = desktopApi()
  if (!desktop) return
  useAgentStore.setState({ info: await desktop.request('agent.resetToken', null) })
}
