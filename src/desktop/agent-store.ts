import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { desktopApi, isDesktop } from './bridge'
import { isAgentProblem } from './agent-problem'
import type { AgentInfo } from './contract'
import { canOpenInApp } from './open-in-app'

interface AgentStore {
  info: AgentInfo | null
  dialogOpen: boolean
  /** True while the problem dialog of the agent server shows. */
  problemOpen: boolean
}

export const useAgentStore = create<AgentStore>(() => ({ info: null, dialogOpen: false, problemOpen: false }))

function setAgentInfo(info: AgentInfo) {
  useAgentStore.setState(isAgentProblem(info) ? { info } : { info, problemOpen: false })
}

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
 * The desktop app shows it until the first agent call. The website shows it on computers, which run the desktop app.
 * Both hide it permanently when the user closes it.
 */
export function useAgentIntroVisible() {
  return useAgentHistory((state) => !state.introHidden && (isDesktop() ? state.lastCallAt === null : canOpenInApp()))
}

/** Returns true while the agent server cannot take connections. */
export function useAgentProblem() {
  return useAgentStore((store) => isAgentProblem(store.info))
}

export function openConnectAgent() {
  useAgentStore.setState({ dialogOpen: true })
}

/** Shows the problem dialog of the agent server. It closes when the problem ends. */
export function openAgentProblem() {
  useAgentStore.setState({ problemOpen: true })
}

/** Loads the agent server status from the main process and follows its changes. */
export function watchAgentInfo(): () => void {
  const desktop = desktopApi()
  if (!desktop) return () => undefined
  void desktop.request('agent.info', null).then(setAgentInfo)
  return desktop.on('agent.info', setAgentInfo)
}

/** Moves the agent server to another port. Agents need a new setup after it. */
export async function changeAgentPort(): Promise<AgentInfo | null> {
  const desktop = desktopApi()
  if (!desktop) return null
  const info = await desktop.request('agent.changePort', null)
  setAgentInfo(info)
  return info
}

export async function resetAgentToken() {
  const desktop = desktopApi()
  if (!desktop) return
  useAgentStore.setState({ info: await desktop.request('agent.resetToken', null) })
}
