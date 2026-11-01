import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

const RELEASE = path.join(import.meta.dirname, '..', 'release')
const START_TIMEOUT_MS = 90_000
const POLL_MS = 500
const MAC_FOLDERS = { arm64: 'mac-arm64', x64: 'mac' }

function packagedApp() {
  if (process.platform === 'win32') return path.join(RELEASE, 'win-unpacked', 'Diagrams.exe')
  if (process.platform === 'linux') return path.join(RELEASE, 'linux-unpacked', 'diagrams')
  const folder = MAC_FOLDERS[process.arch]
  if (!folder) throw new Error(`The smoke test has no macOS app for ${process.arch}.`)
  return path.join(RELEASE, folder, 'Diagrams.app', 'Contents', 'MacOS', 'Diagrams')
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

async function connect(port, tokenFile, exitStatus) {
  const deadline = Date.now() + START_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (exitStatus.value) throw new Error(`The packaged app stopped before it answered: ${exitStatus.value}.`)
    if (existsSync(tokenFile)) {
      const client = new Client({ name: 'smoke-test', version: '1.0.0' })
      try {
        await client.connect(
          new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
            requestInit: { headers: { Authorization: `Bearer ${readFileSync(tokenFile, 'utf8').trim()}` } },
          }),
        )
        return client
      } catch {
        await client.close().catch(() => undefined)
      }
    }
    await delay(POLL_MS)
  }
  throw new Error(`The packaged app did not answer on port ${port} within ${START_TIMEOUT_MS} ms.`)
}

async function callTool(client, name, args) {
  const result = await client.callTool({ name, arguments: args })
  if (result.isError) throw new Error(`${name} failed: ${result.content.map((item) => item.text).join(' ')}`)
  return result.content
}

const executable = process.argv[2] ?? packagedApp()
if (!existsSync(executable)) throw new Error(`No packaged app at ${executable}. Run electron-builder first.`)
const temp = mkdtempSync(path.join(tmpdir(), 'diagrams-smoke-'))
const userData = path.join(temp, 'user-data')
const dataDir = path.join(temp, 'diagrams')
const port = await freePort()
console.log(`Starting ${executable}`)
const child = spawn(executable, [], {
  env: {
    ...process.env,
    DIAGRAMS_USER_DATA: userData,
    DIAGRAMS_DATA_DIR: dataDir,
    DIAGRAMS_AGENT_PORT: String(port),
    DIAGRAMS_REGISTER_PROTOCOL: '0',
    DIAGRAMS_HIDE_WINDOW: 'offscreen',
    ELECTRON_ENABLE_LOGGING: '1',
  },
  stdio: 'inherit',
})
const exitStatus = { value: null }
child.once('error', (error) => {
  exitStatus.value = error.message
})
const exited = new Promise((resolve) =>
  child.once('exit', (code, signal) => {
    exitStatus.value ??= signal ? `signal ${signal}` : `exit code ${code}`
    resolve()
  }),
)

try {
  const client = await connect(port, path.join(userData, 'agent-token'), exitStatus)
  const created = JSON.parse(
    (await callTool(client, 'create_diagram', { name: 'Smoke test', template: 'order-system' }))[0].text,
  )
  const listed = (await callTool(client, 'list_diagrams', {}))[0].text
  if (!listed.includes(created.diagramId)) throw new Error('list_diagrams does not list the new diagram.')
  const image = (await callTool(client, 'render_image', { diagramId: created.diagramId, maxSizePx: 512 })).find(
    (item) => item.type === 'image',
  )
  if (!image?.data) throw new Error('render_image returned no image.')
  await client.close()
  const files = readdirSync(dataDir)
  if (!files.includes(`${created.diagramId}.diagram.json`)) throw new Error('The app did not write the diagram file.')
  console.log(`The packaged app works: it created, listed, rendered and saved "${created.name}".`)
} finally {
  child.kill()
  await Promise.race([exited, delay(10_000)])
  rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
}
