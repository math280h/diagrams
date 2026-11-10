import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AGENT_PORT, AGENT_PORTS, FIRST_DEV_AGENT_PORT } from '@/desktop/constants'
import { loadAgentPort, nextFreeAgentPort } from './port'

const folders: string[] = []

function userData() {
  const folder = mkdtempSync(path.join(tmpdir(), 'agent-port-'))
  folders.push(folder)
  return folder
}

function freeExcept(...used: number[]) {
  return async (port: number) => !used.includes(port)
}

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

describe('loadAgentPort', () => {
  it('takes the first free port at the first start and keeps it', async () => {
    const folder = userData()
    expect(await loadAgentPort(folder, AGENT_PORT, freeExcept(AGENT_PORT))).toBe(AGENT_PORT + 1)
    expect(readFileSync(path.join(folder, 'agent-port'), 'utf8')).toBe(String(AGENT_PORT + 1))
    expect(await loadAgentPort(folder, AGENT_PORT, freeExcept())).toBe(AGENT_PORT + 1)
  })

  it('keeps its port when another program uses it, so that the agent setup stays valid', async () => {
    const folder = userData()
    writeFileSync(path.join(folder, 'agent-port'), String(AGENT_PORT + 3))
    expect(await loadAgentPort(folder, AGENT_PORT, freeExcept(AGENT_PORT + 3))).toBe(AGENT_PORT + 3)
  })

  it('starts a development app further on, and goes round to the start of the range', async () => {
    expect(await loadAgentPort(userData(), FIRST_DEV_AGENT_PORT, freeExcept())).toBe(FIRST_DEV_AGENT_PORT)
    const allButFirst = AGENT_PORTS.filter((port) => port >= FIRST_DEV_AGENT_PORT)
    expect(await loadAgentPort(userData(), FIRST_DEV_AGENT_PORT, freeExcept(...allButFirst))).toBe(AGENT_PORT)
  })

  it('takes a new port when the kept one is not an agent port', async () => {
    const folder = userData()
    writeFileSync(path.join(folder, 'agent-port'), '80')
    expect(await loadAgentPort(folder, AGENT_PORT, freeExcept())).toBe(AGENT_PORT)
  })

  it('keeps the first port when all ports are in use', async () => {
    expect(await loadAgentPort(userData(), AGENT_PORT, freeExcept(...AGENT_PORTS))).toBe(AGENT_PORT)
  })
})

describe('nextFreeAgentPort', () => {
  it('finds the next free port after the current one, also at the start of the range', async () => {
    expect(await nextFreeAgentPort(AGENT_PORT, freeExcept(AGENT_PORT + 1))).toBe(AGENT_PORT + 2)
    expect(await nextFreeAgentPort(AGENT_PORTS.at(-1)!, freeExcept())).toBe(AGENT_PORT)
    expect(await nextFreeAgentPort(AGENT_PORT, freeExcept(...AGENT_PORTS))).toBeNull()
  })
})
