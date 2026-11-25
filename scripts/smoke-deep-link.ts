import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { APPIMAGE_LINK_ENTRY, CONNECT_AGENT_LINK, DEEP_LINK_SCHEME } from '../src/desktop/constants.ts'

const USAGE = 'Usage: node scripts/smoke-deep-link.ts <AppImage> <desktop entry that must handle the links>'
const START_TIMEOUT_MS = 90_000
const HANDLER_TIMEOUT_MS = 30_000
const HANDLER_SETTLE_MS = 5000
const POLL_MS = 500
const STOP_TIMEOUT_MS = 10_000
const UNSET_VARIABLES = ['DIAGRAMS_REGISTER_PROTOCOL', 'XDG_CURRENT_DESKTOP', 'DESKTOP_SESSION']

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() =>
        typeof address === 'object' && address ? resolve(address.port) : reject(new Error('No free port.')),
      )
    })
  })
}

async function appEnv(temp: string, name: string): Promise<NodeJS.ProcessEnv> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    XDG_DATA_HOME: path.join(temp, 'data'),
    XDG_CONFIG_HOME: path.join(temp, 'config'),
    DIAGRAMS_USER_DATA: path.join(temp, name, 'user-data'),
    DIAGRAMS_DATA_DIR: path.join(temp, name, 'diagrams'),
    DIAGRAMS_AUTOSTART_DIR: path.join(temp, name, 'autostart'),
    DIAGRAMS_AGENT_PORT: String(await freePort()),
    DIAGRAMS_HIDE_WINDOW: 'offscreen',
  }
  for (const variable of UNSET_VARIABLES) delete env[variable]
  return env
}

function linkEntryFile(temp: string): string {
  return path.join(temp, 'data', 'applications', APPIMAGE_LINK_ENTRY)
}

function tokenFile(env: NodeJS.ProcessEnv): string {
  return path.join(env.DIAGRAMS_USER_DATA ?? '', 'agent-token')
}

function linkHandler(env: NodeJS.ProcessEnv): string {
  return execFileSync('xdg-mime', ['query', 'default', `x-scheme-handler/${DEEP_LINK_SCHEME}`], { env })
    .toString()
    .trim()
}

async function waitFor(what: string, done: () => boolean, failure: () => string | null, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (done()) return
    const failed = failure()
    if (failed) throw new Error(`${failed} before ${what}.`)
    await delay(POLL_MS)
  }
  throw new Error(`Within ${timeoutMs} ms, ${what} did not occur.`)
}

function startGroup(program: string, args: string[], env: NodeJS.ProcessEnv): ChildProcess {
  return spawn(program, args, { env, stdio: 'inherit', detached: true })
}

async function stopGroup(child: ChildProcess) {
  if (child.pid === undefined) return
  const exited = new Promise((resolve) => child.once('exit', resolve))
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    return
  }
  if (child.exitCode === null) await Promise.race([exited, delay(STOP_TIMEOUT_MS)])
}

async function checkHandler(appImage: string, temp: string, expected: string) {
  const env = await appEnv(temp, 'start')
  console.log(`Starting ${appImage}`)
  const app = startGroup(appImage, [], env)
  const stopped = () => (app.exitCode === null ? null : `The app stopped with exit code ${app.exitCode}`)
  try {
    await waitFor('the start of the app', () => existsSync(tokenFile(env)), stopped, START_TIMEOUT_MS)
    await waitFor(`the handler ${expected}`, () => linkHandler(env) === expected, stopped, HANDLER_TIMEOUT_MS)
    await delay(HANDLER_SETTLE_MS)
    const handler = linkHandler(env)
    if (handler !== expected) throw new Error(`The app made ${handler} the handler of the links, not ${expected}.`)
  } finally {
    await stopGroup(app)
  }
}

async function openLink(appImage: string, temp: string) {
  const entry = readFileSync(linkEntryFile(temp), 'utf8')
  if (!entry.includes(`\nTryExec=${appImage}\n`)) throw new Error(`The entry does not name ${appImage}:\n${entry}`)
  const env = await appEnv(temp, 'link')
  console.log(`Opening ${CONNECT_AGENT_LINK} with xdg-open. The handler is ${linkHandler(env)}.\n${entry}`)
  const xdgOpen = execFileSync('sh', ['-c', 'command -v xdg-open'], { env }).toString().trim()
  const opener = startGroup('sh', ['-x', xdgOpen, CONNECT_AGENT_LINK], { ...env, XDG_UTILS_DEBUG_LEVEL: '3' })
  const failed = () =>
    opener.exitCode !== null && opener.exitCode !== 0 ? `xdg-open stopped with exit code ${opener.exitCode}` : null
  try {
    await waitFor('the start of the app from the link', () => existsSync(tokenFile(env)), failed, START_TIMEOUT_MS)
  } finally {
    await stopGroup(opener)
  }
}

const [appImageArg, expected] = process.argv.slice(2)
if (!appImageArg || !expected?.endsWith('.desktop')) throw new Error(USAGE)
const appImage = realpathSync(appImageArg)
const temp = mkdtempSync(path.join(tmpdir(), 'diagrams-deep-link-'))
try {
  await checkHandler(appImage, temp, expected)
  if (expected === APPIMAGE_LINK_ENTRY) {
    await openLink(appImage, temp)
    console.log(`${DEEP_LINK_SCHEME}:// links open the AppImage through ${APPIMAGE_LINK_ENTRY}.`)
  } else if (existsSync(linkEntryFile(temp))) {
    throw new Error(`The AppImage wrote ${APPIMAGE_LINK_ENTRY}, but ${expected} has the links.`)
  } else {
    console.log(`The AppImage leaves the links to ${expected} and writes no desktop entry.`)
  }
} finally {
  rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
}
