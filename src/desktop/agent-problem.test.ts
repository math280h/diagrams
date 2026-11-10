import { describe, expect, it } from 'vitest'
import { problemReport } from '@/lib/problem-report'
import { agentProblem, isAgentProblem } from './agent-problem'
import type { AgentInfo } from './contract'

const TAKEN: AgentInfo = {
  state: 'port-in-use',
  port: 27419,
  url: 'http://127.0.0.1:27419/mcp',
  token: 'secret-token-that-must-not-show',
  message: 'Another program uses port 27419, for example a second Diagrams app.',
  marketplacePath: 'C:\\Users\\someone\\AppData\\Roaming\\Diagrams\\claude-marketplace',
}

describe('agent problems', () => {
  it('counts a taken port and a failed start as problems', () => {
    expect(isAgentProblem(TAKEN)).toBe(true)
    expect(isAgentProblem({ ...TAKEN, state: 'failed' })).toBe(true)
    expect(isAgentProblem({ ...TAKEN, state: 'running' })).toBe(false)
    expect(isAgentProblem(null)).toBe(false)
  })

  it('gives the bug report the app, the server state, the port and the message', () => {
    expect(problemReport('Diagrams 0.3.0, Windows 10.0.26200 (x64)', agentProblem(TAKEN))).toBe(
      [
        'Diagrams 0.3.0, Windows 10.0.26200 (x64)',
        'Agent server: port-in-use on port 27419',
        'Another program uses port 27419, for example a second Diagrams app.',
      ].join('\n'),
    )
  })

  it('leaves the access token and the plugin folder out of the bug report', () => {
    const report = problemReport('Diagrams desktop app', agentProblem(TAKEN))
    expect(report).not.toContain(TAKEN.token)
    expect(report).not.toContain('someone')
  })
})
