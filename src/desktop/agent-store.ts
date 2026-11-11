import { toast } from 'sonner'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { updateProblem } from '@/store/problem-store'
import { AGENT_PROBLEM_KEY, agentProblem, isAgentProblem } from './agent-problem'
import { desktopApi, isDesktop } from './bridge'
import type { AgentInfo } from './contract'
import { canOpenInApp } from './open-in-app'

interface AgentStore {
  info: AgentInfo | null
  dialogOpen: boolean
}

export const useAgentStore = create<AgentStore>(() => ({ info: null, dialogOpen: false }))

/** Returns the notice that agents connect on a new port, because another program used the kept one. */
export function movedPortNotice(info: AgentInfo): string | null {
  if (info.movedFrom === null || info.state !== 'running') return null
  return `Port ${info.movedFrom} was in use, so agents now connect on port ${info.port}. If you set up an agent before, run the setup again.`
}

function setAgentInfo(info: AgentInfo) {
  const previous = useAgentStore.getState().info
  const notice = movedPortNotice(info)
  const agentsUsedBefore = useAgentHistory.getState().lastCallAt !== null
  if (notice && previous && !movedPortNotice(previous) && agentsUsedBefore) toast.info(notice, { duration: Infinity })
  useAgentStore.setState({ info })
  updateProblem(AGENT_PROBLEM_KEY, isAgentProblem(info) ? agentProblem(info) : null)
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

/** Loads the agent server status from the main process and follows its changes. */
export function watchAgentInfo(): () => void {
  const desktop = desktopApi()
  if (!desktop) return () => undefined
  void desktop.request('agent.info', null).then(setAgentInfo)
  return desktop.on('agent.info', setAgentInfo)
}

export async function resetAgentToken() {
  const desktop = desktopApi()
  if (!desktop) return
  useAgentStore.setState({ info: await desktop.request('agent.resetToken', null) })
}
