import { create } from 'zustand'

interface AgentActivity {
  /** The title of the tool that an agent runs now, or `null`. */
  title: string | null
  /** True if that tool only reads. */
  readOnly: boolean
}

export const useAgentActivity = create<AgentActivity>(() => ({ title: null, readOnly: false }))
