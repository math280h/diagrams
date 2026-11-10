import { describe, expect, it } from 'vitest'
import type { AgentInfo } from './contract'
import { problemDetails } from './problem-details'

const TAKEN: AgentInfo = {
  state: 'port-in-use',
  port: 27419,
  url: 'http://127.0.0.1:27419/mcp',
  token: 'secret-token-that-must-not-show',
  message: 'Another program uses port 27419, for example a second Diagrams app.',
  marketplacePath: 'C:\\Users\\someone\\AppData\\Roaming\\Diagrams\\claude-marketplace',
}

describe('problemDetails', () => {
  it('gives the version, the system, the server state, the port and the message', () => {
    expect(problemDetails(TAKEN, { version: '0.3.0', system: 'Windows 10.0.26200 (x64)' })).toBe(
      [
        'Diagrams 0.3.0, Windows 10.0.26200 (x64)',
        'Agent server: port-in-use on port 27419',
        'Another program uses port 27419, for example a second Diagrams app.',
      ].join('\n'),
    )
  })

  it('leaves out the access token and the plugin folder', () => {
    const text = problemDetails(TAKEN, null)
    expect(text).not.toContain(TAKEN.token)
    expect(text).not.toContain('someone')
    expect(text.split('\n')[0]).toBe('Diagrams desktop app')
  })
})
