import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { AGENT_PORTS } from '@/desktop/constants'

const PORT_FILE = 'agent-port'

export type PortCheck = (port: number) => Promise<boolean>

/** Returns the agent ports in order from `first`, and then from the start of the range. */
function portsFrom(first: number): number[] {
  const start = Math.max(0, AGENT_PORTS.indexOf(first))
  return [...AGENT_PORTS.slice(start), ...AGENT_PORTS.slice(0, start)]
}

async function firstFree(ports: readonly number[], isFree: PortCheck): Promise<number | null> {
  for (const port of ports) if (await isFree(port)) return port
  return null
}

function keptPort(folder: string): number | null {
  let text: string
  try {
    text = readFileSync(path.join(folder, PORT_FILE), 'utf8')
  } catch {
    return null
  }
  const port = Number(text.trim())
  return AGENT_PORTS.includes(port) ? port : null
}

export function saveAgentPort(folder: string, port: number) {
  mkdirSync(folder, { recursive: true })
  writeFileSync(path.join(folder, PORT_FILE), String(port))
}

/**
 * Returns the agent port that the app keeps in the folder, also when another program uses it. Without a kept port, it
 * takes the first free port from `first` and keeps it.
 */
export async function loadAgentPort(folder: string, first: number, isFree: PortCheck): Promise<number> {
  const kept = keptPort(folder)
  if (kept !== null) return kept
  const port = (await firstFree(portsFrom(first), isFree)) ?? first
  saveAgentPort(folder, port)
  return port
}

/** Returns the next free agent port after `current`, or `null` if all of them are in use. */
export function nextFreeAgentPort(current: number, isFree: PortCheck): Promise<number | null> {
  return firstFree(portsFrom(current).slice(1), isFree)
}
