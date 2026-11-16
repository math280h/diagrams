import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:net'
import path from 'node:path'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import type { ElectronApplication } from '@playwright/test'
import { AGENT_ENDPOINT, AGENT_HOST, AGENT_PORTS, BUG_REPORT_URL } from '@/desktop/constants'
import { agentUrl, expect, launchApp, test } from './fixtures'

const RETRY_WAIT_MS = 15_000
const MOVE_WAIT_MS = 30_000

function listen(server: Server, port: number) {
  return new Promise<boolean>((resolve) => {
    server.once('error', () => resolve(false))
    server.listen(port, AGENT_HOST, () => resolve(true))
  })
}

interface HeldPort {
  port: number
  release: () => Promise<void>
}

/** Takes the free agent ports with another program, the way a second app or another user would. */
async function holdAgentPorts(count = AGENT_PORTS.length): Promise<HeldPort[]> {
  const held: HeldPort[] = []
  for (const port of AGENT_PORTS) {
    if (held.length === count) break
    const server = createServer()
    if (await listen(server, port)) {
      held.push({ port, release: () => new Promise<void>((resolve) => server.close(() => resolve())) })
    }
  }
  if (held.length === 0) throw new Error('Other programs use all the agent ports.')
  return held
}

async function releaseAll(held: readonly HeldPort[]) {
  await Promise.all(held.map((port) => port.release().catch(() => undefined)))
}

function keptPort(userData: string) {
  return Number(readFileSync(path.join(userData, 'agent-port'), 'utf8'))
}

async function agentAnswers(userData: string) {
  const token = readFileSync(path.join(userData, 'agent-token'), 'utf8').trim()
  const client = new Client({ name: 'e2e', version: '1.0.0' })
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${agentUrl(keptPort(userData))}${AGENT_ENDPOINT}`), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      }),
    )
    return (await client.listTools()).tools.length > 0
  } catch {
    return false
  } finally {
    await client.close()
  }
}

function withoutFixedPort(env: Record<string, string>, folder?: string) {
  const { DIAGRAMS_AGENT_PORT: _fixed, ...rest } = env
  return folder
    ? { ...rest, DIAGRAMS_USER_DATA: path.join(folder, 'user-data'), DIAGRAMS_DATA_DIR: path.join(folder, 'diagrams') }
    : rest
}

async function closeAll(apps: ElectronApplication[]) {
  await Promise.all(apps.map((app) => app.close()))
}

test('runs two apps at once, each with its own agent port that it keeps', async ({ appEnv, dirs }) => {
  const apps: ElectronApplication[] = []
  try {
    const first = await launchApp(withoutFixedPort(appEnv))
    apps.push(first.app)
    await expect.poll(() => agentAnswers(dirs.userData), { timeout: RETRY_WAIT_MS }).toBe(true)

    const other = path.join(path.dirname(dirs.userData), 'second-app')
    mkdirSync(other)
    const second = await launchApp(withoutFixedPort(appEnv, other))
    apps.push(second.app)
    const otherUserData = path.join(other, 'user-data')
    await expect.poll(() => agentAnswers(otherUserData), { timeout: RETRY_WAIT_MS }).toBe(true)

    expect(AGENT_PORTS).toContain(keptPort(dirs.userData))
    expect(AGENT_PORTS).toContain(keptPort(otherUserData))
    expect(keptPort(otherUserData)).not.toBe(keptPort(dirs.userData))
    expect(await agentAnswers(dirs.userData)).toBe(true)
  } finally {
    await closeAll(apps)
  }
})

test('keeps its port when another program lets it go within a few seconds', async ({ appEnv, dirs }) => {
  const [taken] = await holdAgentPorts(1)
  mkdirSync(dirs.userData, { recursive: true })
  writeFileSync(path.join(dirs.userData, 'agent-port'), String(taken!.port))
  const launching = launchApp(withoutFixedPort(appEnv))
  await taken!.release()
  const { app } = await launching
  try {
    await expect.poll(() => agentAnswers(dirs.userData), { timeout: RETRY_WAIT_MS }).toBe(true)
    expect(keptPort(dirs.userData)).toBe(taken!.port)
  } finally {
    await app.close()
  }
})

test('explains a taken port with details for a bug report, then moves to a free port by itself', async ({
  appEnv,
  dirs,
}) => {
  const held = await holdAgentPorts()
  const kept = held[0]!.port
  mkdirSync(dirs.userData, { recursive: true })
  writeFileSync(path.join(dirs.userData, 'agent-port'), String(kept))
  const { app, window } = await launchApp(withoutFixedPort(appEnv))
  try {
    await expect(window.getByText('Agents cannot connect', { exact: true })).toBeVisible()
    await window.getByRole('button', { name: 'More details…' }).click()
    const problem = window.getByRole('dialog', { name: 'Agents cannot connect' })
    await expect(problem).toContainText(`Another program uses port ${kept}`)
    const details = problem.locator('code')
    await expect(details).toContainText(/^Diagrams \d+\.\d+\.\d+.*, (Windows|macOS|Linux) /)
    await expect(details).toContainText(`Agent server: port-in-use on port ${kept}`)
    await expect(problem.getByRole('link', { name: 'Open an issue on GitHub' })).toHaveAttribute('href', BUG_REPORT_URL)
    await expect(problem).toContainText('Other programs use all the agent ports', { timeout: MOVE_WAIT_MS })

    const free = held.at(-1)!
    await free.release()
    await expect(problem).toBeHidden({ timeout: RETRY_WAIT_MS })
    expect(keptPort(dirs.userData)).toBe(free.port)
    await window.getByRole('banner').getByRole('button', { name: 'Connect an agent' }).click()
    const setup = window.getByRole('dialog', { name: 'Connect an agent' })
    await expect(setup).toContainText(`Agents can connect at ${agentUrl(free.port)}${AGENT_ENDPOINT}`)
    await expect(setup).toContainText(`Port ${kept} was in use, so agents now connect on port ${free.port}.`)
    expect(await agentAnswers(dirs.userData)).toBe(true)
  } finally {
    await releaseAll(held)
    await app.close()
  }
})
