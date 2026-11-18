import { spawn } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import {
  _electron as electron,
  test as base,
  expect,
  type ElectronApplication,
  type Page,
  type TestInfo,
} from '@playwright/test'
import electronPath from 'electron'
import { AGENT_ENDPOINT, AGENT_HOST } from '@/desktop/constants'
import { createDiagram } from '@/model/defaults'

export { expect }

const CRASH_DUMPS_FOLDER = 'Crashpad'
const CRASH_LOG_FILE = path.join('reports', 'crashes.json')
const MAX_DUMP_FOLDER_DEPTH = 3
const OUTPUT_CLOSE_WAIT_MS = 5000

export function agentUrl(port: number): string {
  return `http://${AGENT_HOST}:${port}`
}

/**
 * Returns the crash dump files in the crash dumps folder of the user data folder.
 *
 * @param options.unfinished - Also returns the dumps that Crashpad still writes.
 */
export function crashDumps(userData: string, { unfinished = false } = {}): string[] {
  const find = (folder: string, depth: number): string[] => {
    if (depth > MAX_DUMP_FOLDER_DEPTH) return []
    let names: string[]
    try {
      names = readdirSync(folder)
    } catch {
      return []
    }
    return names.flatMap((name) => {
      const file = path.join(folder, name)
      // Crashpad writes a dump in the folder "new" and moves it when the dump is complete.
      if (statSync(file).isDirectory()) return name === 'new' && !unfinished ? [] : find(file, depth + 1)
      return name.endsWith('.dmp') ? [file] : []
    })
  }
  return find(path.join(userData, CRASH_DUMPS_FOLDER), 0)
}

/** Collects what explains a failed test: the output of each app process, the crashes and the files of the test. */
export class Evidence {
  private readonly outputs: string[][] = []
  private readonly outputsClosed: Promise<void>[] = []
  private readonly files = new Map<string, string | Uint8Array>()

  watch(app: ElectronApplication) {
    const child = app.process()
    const output: string[] = []
    this.outputs.push(output)
    this.outputsClosed.push(new Promise((resolve) => child.once('close', () => resolve())))
    const add = (chunk: Buffer) => output.push(chunk.toString())
    child.stdout?.on('data', add)
    child.stderr?.on('data', add)
  }

  /** Keeps a file for the test results. The test results get the file only when the test fails. */
  keep(name: string, data: string | Uint8Array) {
    this.files.set(name, data)
  }

  async keepGpuState(app: ElectronApplication) {
    const state = await app
      .evaluate(async ({ app: electronApp }) => ({
        featureStatus: electronApp.getGPUFeatureStatus(),
        info: await electronApp.getGPUInfo('basic'),
      }))
      .catch((error: unknown) => ({ error: String(error) }))
    this.keep('gpu.json', JSON.stringify(state, null, 2))
  }

  /** Writes the evidence to the test results. It waits a short time for the last output of the app processes. */
  async write(testInfo: TestInfo, userData: string) {
    await Promise.race([Promise.all(this.outputsClosed), delay(OUTPUT_CLOSE_WAIT_MS, undefined, { ref: false })])
    this.outputs.forEach((output, index) => writeFileSync(testInfo.outputPath(`app-${index + 1}.log`), output.join('')))
    for (const [name, data] of this.files) writeFileSync(testInfo.outputPath(name), data)
    const crashLog = path.join(userData, CRASH_LOG_FILE)
    if (existsSync(crashLog)) copyFileSync(crashLog, testInfo.outputPath('crashes.json'))
    for (const dump of crashDumps(userData, { unfinished: true })) {
      copyFileSync(dump, testInfo.outputPath(path.basename(dump)))
    }
  }
}

let currentEvidence: Evidence | null = null

/** Starts the app with Chromium logs on, and keeps its output for the evidence of the test. */
export async function launchElectron(options: { args: string[]; env: Record<string, string> }) {
  const app = await electron.launch({ ...options, env: { ...options.env, ELECTRON_ENABLE_LOGGING: '1' } })
  currentEvidence?.watch(app)
  return app
}

function failed(testInfo: TestInfo) {
  return testInfo.status !== testInfo.expectedStatus
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

/** Starts the app with the environment and waits for its window. */
export async function launchApp(env: Record<string, string>): Promise<{ app: ElectronApplication; window: Page }> {
  const app = await launchElectron({ args: ['.'], env })
  const window = await app.firstWindow()
  await expect(window.locator('header').first()).toBeVisible({ timeout: 30_000 })
  return { app, window }
}

/** Resolves when the app process exits, and fails after 15 seconds. */
export function untilExit(app: ElectronApplication): Promise<unknown> {
  const exited = new Promise<void>((resolve) => app.process().once('exit', () => resolve()))
  return Promise.race([
    exited,
    new Promise((_, reject) => setTimeout(() => reject(new Error('The app did not quit.')), 15_000)),
  ])
}

export interface DesktopFixtures {
  /**
   * How the app window stays hidden. `offscreen` renders at the full frame rate; `native` keeps a native window that
   * Chromium throttles, as for a minimized window.
   */
  hideWindow: 'offscreen' | 'native'
  dirs: { userData: string; data: string }
  /** The evidence of the test. A failed test writes it to its test results. */
  evidence: Evidence
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
  evidence: [
    async ({ dirs }, use, testInfo) => {
      const evidence = new Evidence()
      currentEvidence = evidence
      await use(evidence)
      currentEvidence = null
      if (failed(testInfo)) await evidence.write(testInfo, dirs.userData)
    },
    { auto: true },
  ],
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
  app: async ({ appEnv, evidence }, use, testInfo) => {
    const app = await launchElectron({ args: ['.'], env: appEnv })
    await use(app)
    if (failed(testInfo)) await evidence.keepGpuState(app)
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
    const client = new Client({ name: 'e2e', version: '1.0.0' })
    await connectAgent(client, dirs.userData, agentPort)
    await use(client)
    await client.close()
  },
})

/** Connects the client to the agent server of the app as soon as the app has written its access token. */
export async function connectAgent(client: Client, userData: string, port: number, timeoutMs?: number) {
  const tokenFile = path.join(userData, 'agent-token')
  await expect
    .poll(
      async () => {
        if (!existsSync(tokenFile)) return false
        try {
          await client.connect(
            new StreamableHTTPClientTransport(new URL(`${agentUrl(port)}${AGENT_ENDPOINT}`), {
              requestInit: { headers: { Authorization: `Bearer ${readFileSync(tokenFile, 'utf8').trim()}` } },
            }),
          )
          return true
        } catch {
          return false
        }
      },
      { ...(timeoutMs && { timeout: timeoutMs }) },
    )
    .toBe(true)
}

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
