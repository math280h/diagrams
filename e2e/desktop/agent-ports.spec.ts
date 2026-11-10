import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:net'
import path from 'node:path'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { _electron as electron, type ElectronApplication } from '@playwright/test'
import { AGENT_ENDPOINT, AGENT_HOST, AGENT_PORTS, BUG_REPORT_URL } from '@/desktop/constants'
import { agentUrl, expect, test } from './fixtures'

const RETRY_WAIT_MS = 15_000

function listen(server: Server, port: number) {
  return new Promise<boolean>((resolve) => {
    server.once('error', () => resolve(false))
    server.listen(port, AGENT_HOST, () => resolve(true))
  })
}

/** Takes a free agent port with another program, the way a second app or another user would. */
async function occupyAgentPort() {
  for (const port of AGENT_PORTS) {
    const server = createServer()
    if (await listen(server, port)) {
      return { port, release: () => new Promise<void>((resolve) => server.close(() => resolve())) }
    }
  }
  throw new Error('Other programs use all the agent ports.')
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

async function launch(env: Record<string, string>) {
  const app = await electron.launch({ args: ['.'], env })
  const window = await app.firstWindow()
  await expect(window.locator('header').first()).toBeVisible({ timeout: 30_000 })
  return { app, window }
}

async function closeAll(apps: ElectronApplication[]) {
  await Promise.all(apps.map((app) => app.close()))
}

test('runs two apps at once, each with its own agent port that it keeps', async ({ appEnv, dirs }) => {
  const apps: ElectronApplication[] = []
  try {
    const first = await launch(withoutFixedPort(appEnv))
    apps.push(first.app)
    await expect.poll(() => agentAnswers(dirs.userData), { timeout: RETRY_WAIT_MS }).toBe(true)

    const other = path.join(path.dirname(dirs.userData), 'second-app')
    mkdirSync(other)
    const second = await launch(withoutFixedPort(appEnv, other))
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

test('waits for its kept port while another program uses it, and connects when it is free', async ({
  appEnv,
  dirs,
}) => {
  const taken = await occupyAgentPort()
  mkdirSync(dirs.userData, { recursive: true })
  writeFileSync(path.join(dirs.userData, 'agent-port'), String(taken.port))
  const { app, window } = await launch(withoutFixedPort(appEnv))
  try {
    await expect(window.getByText('Agents cannot connect', { exact: true })).toBeVisible()
    await window.getByRole('button', { name: 'More details…' }).click()
    const problem = window.getByRole('dialog', { name: 'Agents cannot connect' })
    await expect(problem).toContainText(`Another program uses port ${taken.port}`)
    await expect(problem.getByRole('button', { name: 'Use another port' })).toBeVisible()
    const details = problem.locator('code')
    await expect(details).toContainText(/^Diagrams \d+\.\d+\.\d+.*, (Windows|macOS|Linux) /)
    await expect(details).toContainText(`Agent server: port-in-use on port ${taken.port}`)
    await expect(problem.getByRole('link', { name: 'Report a problem' })).toHaveAttribute('href', BUG_REPORT_URL)

    await taken.release()
    await expect(problem).toBeHidden({ timeout: RETRY_WAIT_MS })
    await window.getByRole('banner').getByRole('button', { name: 'Connect an agent' }).click()
    await expect(window.getByRole('dialog')).toContainText(
      `Agents can connect at ${agentUrl(taken.port)}${AGENT_ENDPOINT}`,
    )
    expect(keptPort(dirs.userData)).toBe(taken.port)
  } finally {
    await taken.release().catch(() => undefined)
    await app.close()
  }
})

test('moves to another port on request, and keeps it', async ({ appEnv, dirs }) => {
  const taken = await occupyAgentPort()
  mkdirSync(dirs.userData, { recursive: true })
  writeFileSync(path.join(dirs.userData, 'agent-port'), String(taken.port))
  const { app, window } = await launch(withoutFixedPort(appEnv))
  try {
    await window.getByRole('banner').getByRole('button', { name: 'Connect an agent' }).click()
    const setup = window.getByRole('dialog', { name: 'Connect an agent' })
    await setup.getByRole('button', { name: 'More details…' }).click()
    const problem = window.getByRole('dialog', { name: 'Agents cannot connect' })
    await problem.getByRole('button', { name: 'Use another port' }).click()
    await expect(window.getByText(/Agents now connect on port \d+\. Run the setup again\./)).toBeVisible()
    await expect(problem).toBeHidden()

    const moved = keptPort(dirs.userData)
    expect(moved).not.toBe(taken.port)
    expect(AGENT_PORTS).toContain(moved)
    await expect(setup).toContainText(`Agents can connect at ${agentUrl(moved)}${AGENT_ENDPOINT}`)
    await expect(setup.getByRole('button', { name: 'More details…' })).toHaveCount(0)
    expect(await agentAnswers(dirs.userData)).toBe(true)
  } finally {
    await taken.release()
    await app.close()
  }
})
