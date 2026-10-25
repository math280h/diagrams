import { spawn } from 'node:child_process'
import electronPath from 'electron'
import { build, createServer } from 'vite'

const DEV_URL = 'http://127.0.0.1:5173/'
const BUNDLES = ['main', 'preload']
const RESTART_DELAY_MS = 150

async function reachable(url) {
  try {
    return (await fetch(url)).ok
  } catch {
    return false
  }
}

async function ensureDevServer() {
  if (await reachable(DEV_URL)) return null
  const server = await createServer({ server: { host: '127.0.0.1', port: 5173, strictPort: true } })
  await server.listen()
  return server
}

const devServer = await ensureDevServer()
const built = new Set()
const watchers = []
let electron = null
let restartTimer = null
let restarting = false

function startElectron() {
  const env = { ...process.env, VITE_DEV_SERVER_URL: DEV_URL }
  delete env.ELECTRON_RUN_AS_NODE
  electron = spawn(electronPath, ['.'], { stdio: 'inherit', env })
  electron.on('exit', (code) => {
    electron = null
    if (restarting) {
      restarting = false
      startElectron()
      return
    }
    void shutdown(code ?? 0)
  })
}

function scheduleRestart() {
  clearTimeout(restartTimer)
  restartTimer = setTimeout(() => {
    if (built.size < BUNDLES.length) return
    if (!electron) return startElectron()
    restarting = true
    electron.kill()
  }, RESTART_DELAY_MS)
}

async function shutdown(code) {
  await Promise.all(watchers.map((watcher) => watcher.close()))
  await devServer?.close()
  process.exit(code)
}

for (const mode of BUNDLES) {
  const watcher = await build({
    configFile: 'vite.electron.config.ts',
    mode,
    logLevel: 'warn',
    build: { watch: {} },
  })
  watcher.on('event', (event) => {
    if (event.code === 'BUNDLE_END') {
      void event.result?.close()
      built.add(mode)
      scheduleRestart()
    }
    if (event.code === 'ERROR') console.error(event.error)
  })
  watchers.push(watcher)
}

process.on('SIGINT', () => {
  electron?.kill()
  void shutdown(0)
})
