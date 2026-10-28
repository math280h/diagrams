import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { _electron as electron, test as base, expect, type ElectronApplication, type Page } from '@playwright/test'
import electronPath from 'electron'
import { AGENT_ENDPOINT, AGENT_HOST } from '@/desktop/constants'
import { createDiagram } from '@/model/defaults'

export { expect }

export function agentUrl(port: number): string {
  return `http://${AGENT_HOST}:${port}`
}

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer()
    probe.listen(0, AGENT_HOST, () => {
      const { port } = probe.address() as { port: number }
      probe.close(() => resolve(port))
    })
  })
}

export interface DesktopFixtures {
  /**
   * How the app window stays hidden. `offscreen` renders at the full frame rate; `native` keeps a native window that
   * Chromium throttles, as for a minimized window.
   */
  hideWindow: 'offscreen' | 'native'
  dirs: { userData: string; data: string }
  agentPort: number
  appEnv: Record<string, string>
  app: ElectronApplication
  window: Page
  /** Starts a second app process with the arguments, the way the operating system opens a deep link. */
  launchWithArgs: (args: string[]) => Promise<void>
  mcp: Client
}

export const test = base.extend<DesktopFixtures>({
  hideWindow: ['offscreen', { option: true }],
  dirs: async ({}, use) => {
    const root = mkdtempSync(path.join(tmpdir(), 'diagrams-e2e-'))
    await use({ userData: path.join(root, 'user-data'), data: path.join(root, 'diagrams') })
    rmSync(root, { recursive: true, force: true })
  },
  agentPort: async ({}, use) => {
    await use(await freePort())
  },
  appEnv: async ({ dirs, agentPort, hideWindow }, use) => {
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value
    delete env.VITE_DEV_SERVER_URL
    delete env.ELECTRON_RUN_AS_NODE
    await use({
      ...env,
      DIAGRAMS_USER_DATA: dirs.userData,
      DIAGRAMS_DATA_DIR: dirs.data,
      DIAGRAMS_AGENT_PORT: String(agentPort),
      DIAGRAMS_HIDE_WINDOW: hideWindow,
    })
  },
  app: async ({ appEnv }, use) => {
    const app = await electron.launch({ args: ['.'], env: appEnv })
    await use(app)
    await app.close()
  },
  window: async ({ app }, use) => {
    const page = await app.firstWindow()
    await expect(page.locator('header').first()).toBeVisible({ timeout: 30_000 })
    await use(page)
  },
  launchWithArgs: async ({ appEnv }, use) => {
    await use(
      (args) =>
        new Promise((resolve, reject) => {
          const child = spawn(electronPath as unknown as string, ['.', ...args], { env: appEnv, stdio: 'ignore' })
          child.once('error', reject)
          child.once('exit', () => resolve())
        }),
    )
  },
  mcp: async ({ window, dirs, agentPort }, use) => {
    await expect(window.getByRole('banner').getByRole('button', { name: 'Connect an agent' })).toBeVisible()
    const token = readFileSync(path.join(dirs.userData, 'agent-token'), 'utf8').trim()
    const client = new Client({ name: 'e2e', version: '1.0.0' })
    await expect
      .poll(async () => {
        try {
          await client.connect(
            new StreamableHTTPClientTransport(new URL(`${agentUrl(agentPort)}${AGENT_ENDPOINT}`), {
              requestInit: { headers: { Authorization: `Bearer ${token}` } },
            }),
          )
          return true
        } catch {
          return false
        }
      })
      .toBe(true)
    await use(client)
    await client.close()
  },
})

/** Calls an MCP tool and returns its JSON text, or throws with the error text. */
export async function callTool(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args })
  const content = result.content as { type: string; text?: string; data?: string }[]
  const text = content.find((block) => block.type === 'text')?.text ?? '{}'
  if (result.isError) throw new Error(text)
  return { json: JSON.parse(text) as Record<string, unknown>, content }
}

export function diagramFile(name: string, id = 'd_e2e_dropped') {
  return { id, text: JSON.stringify({ ...createDiagram(name), id }) }
}
