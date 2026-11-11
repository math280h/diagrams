import type { Problem } from '@/lib/problem-report'
import type { AgentInfo } from './contract'

/** The key of the agent server problem in the problem dialog, so that the dialog follows the server state. */
export const AGENT_PROBLEM_KEY = 'agent-server'

/** Returns true while the agent server cannot take connections. */
export function isAgentProblem(info: AgentInfo | null): info is AgentInfo {
  return info?.state === 'port-in-use' || info?.state === 'failed'
}

export function agentProblem(info: AgentInfo): Problem {
  return {
    title: 'Agents cannot connect',
    message: info.message ?? 'The agent server stopped.',
    facts: [`Agent server: ${info.state} on port ${info.port}`],
  }
}
