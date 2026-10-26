import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { app, session, shell } from 'electron'
import electronUpdater from 'electron-updater'
import {
  AGENT_ENDPOINT,
  AGENT_HOST,
  AGENT_PORT,
  CLAUDE_MARKETPLACE_FOLDER,
  DEEP_LINK_SCHEME,
  DEV_ORIGINS,
  HANDOFF_TTL_MS,
  WEBSITE_ORIGIN,
} from '@/desktop/constants'
import type { AgentInfo } from '@/desktop/contract'
import { createHandoffCodes, mountHandoff } from './agent/handoff'
import { marketplaceFiles, writeMarketplace } from './agent/marketplace'
import { createAgentServer, startAgentServer } from './agent/server'
import { buildInstructions, bundledPluginConfig, bundledSkillFiles, loadSkills, registerSkills } from './agent/skills'
import { createToken, loadToken } from './agent/token'
import { registerAppScheme, serveRenderer } from './app-protocol'
import { findDeepLink, parseReceiveLink } from './deep-link'
import { registerIpc } from './ipc'
import { configurePaths, diagramsFolder, iconPath, rendererFolder } from './paths'
import { createRendererRpc } from './renderer-rpc'
import { createDiagramFiles } from './storage/diagram-files'
import { watchDiagramFolder } from './storage/watcher'
import { createUpdates, updatePolicy, type UpdatePolicy } from './updates'
import {
  createMainWindow,
  currentWindow,
  focusWindow,
  prepareQuit,
  rendererOrigin,
  setTitleBarColors,
  setWindowHooks,
} from './window'

const FLUSH_TIMEOUT_MS = 3000
/** The time limit of an agent call in the main process. */
const AGENT_CALL_LIMIT_MS = 10 * 60_000
const HANDOFF_OPEN_TIMEOUT_MS = 20_000
const ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set(['clipboard-sanitized-write', 'fullscreen'])

configurePaths()
registerAppScheme()

const codes = createHandoffCodes({ ttlMs: HANDOFF_TTL_MS })
const pendingLinks: string[] = []
let ready = false

function agentPort() {
  const port = Number(process.env.DIAGRAMS_AGENT_PORT ?? AGENT_PORT)
  return Number.isInteger(port) && port > 0 && port < 65_536 ? port : AGENT_PORT
}

function handoffOrigins(): readonly string[] {
  return app.isPackaged ? [WEBSITE_ORIGIN] : [WEBSITE_ORIGIN, ...DEV_ORIGINS]
}

function registerProtocolClient() {
  if (process.env.DIAGRAMS_REGISTER_PROTOCOL === '0') return
  if (!process.defaultApp) {
    app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME)
    return
  }
  const entry = process.argv[1]
  if (process.env.DIAGRAMS_REGISTER_PROTOCOL === '1' && entry) {
    app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME, process.execPath, [path.resolve(entry)])
  }
}

function openLink(url: string | null) {
  if (!url) return
  if (!ready) {
    pendingLinks.push(url)
    return
  }
  const code = parseReceiveLink(url)
  if (code) codes.add(code)
  focusWindow()
}

function readText(file: string): string | null {
  try {
    return readFileSync(file, 'utf8').trim()
  } catch {
    return null
  }
}

function currentUpdatePolicy(): UpdatePolicy {
  if (!app.isPackaged || !existsSync(path.join(process.resourcesPath, 'app-update.yml'))) return { kind: 'none' }
  const manifest = JSON.parse(readText(path.join(app.getAppPath(), 'package.json')) ?? '{}') as { macSigned?: unknown }
  return updatePolicy({
    packaged: true,
    platform: process.platform,
    packageType: readText(path.join(process.resourcesPath, 'package-type')),
    appImage: Boolean(process.env.APPIMAGE),
    macSigned: manifest.macSigned === true,
  })
}

function restrictPermissions() {
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) =>
    callback(ALLOWED_PERMISSIONS.has(permission)),
  )
  session.defaultSession.setPermissionCheckHandler((_contents, permission) => ALLOWED_PERMISSIONS.has(permission))
}

async function start() {
  restrictPermissions()
  const icon = iconPath()
  if (icon && process.platform === 'darwin') app.dock?.setIcon(icon)
  const userData = app.getPath('userData')
  const port = agentPort()
  const files = createDiagramFiles(diagramsFolder(), { trash: (file) => shell.trashItem(file) })
  const rpc = createRendererRpc()
  const watcher = watchDiagramFolder(files, (change) => rpc.emit('files.changed', change))
  const skills = loadSkills(bundledSkillFiles())
  let token = loadToken(userData)
  let agent: AgentInfo = {
    state: 'starting',
    port,
    url: `http://${AGENT_HOST}:${port}${AGENT_ENDPOINT}`,
    token,
    message: null,
    marketplacePath: null,
  }
  const publish = (patch: Partial<AgentInfo>) => {
    agent = { ...agent, ...patch }
    rpc.emit('agent.info', agent)
  }
  const policy = currentUpdatePolicy()
  const updates = createUpdates({
    updater: policy.kind === 'none' ? null : electronUpdater.autoUpdater,
    policy,
    currentVersion: app.getVersion(),
    emit: (info) => rpc.emit('update.info', info),
  })

  const server = createAgentServer({
    version: app.getVersion(),
    port,
    instructions: buildInstructions(skills),
    token: () => token,
    callTool: (tool, args, signal) => {
      if (!currentWindow()) createMainWindow()
      return rpc.call('agent.call', { tool, args }, { timeoutMs: AGENT_CALL_LIMIT_MS, signal })
    },
    extend: (mcp) => registerSkills(mcp, skills),
    routes: (routes) =>
      mountHandoff(routes, {
        codes,
        origins: handoffOrigins,
        open: (text) => rpc.call('handoff.open', { text }, { timeoutMs: HANDOFF_OPEN_TIMEOUT_MS }),
        focus: () => focusWindow(),
      }),
  })

  registerIpc(
    {
      'files.list': async () => ({ folder: files.folder, files: await files.readAll() }),
      'files.write': async ({ id, text }) => {
        await files.write(id, text)
        return null
      },
      'files.remove': async ({ id, trash }) => {
        await files.remove(id, { trash })
        return null
      },
      'files.reveal': async () => {
        await shell.openPath(files.folder)
        return null
      },
      'agent.info': async () => agent,
      'agent.resetToken': async () => {
        token = createToken(userData)
        publish({ token })
        return agent
      },
      'window.setTitleBarColors': async (colors) => {
        setTitleBarColors(colors)
        return null
      },
      'update.info': async () => updates.info(),
      'update.check': () => updates.check(),
      'update.install': async () => {
        if (updates.info().state !== 'ready') return null
        await prepareQuit()
        updates.install()
        return null
      },
    },
    rendererOrigin,
  )

  setWindowHooks({
    attach: (contents) => rpc.attach(contents),
    beforeClose: async () => {
      await rpc.call('app.flush', null, { timeoutMs: FLUSH_TIMEOUT_MS }).catch(() => undefined)
      await files.drain()
    },
    focused: () => watcher.rescan(),
    navigated: (state) => rpc.emit('window.navigation', state),
  })

  app.on('will-quit', () => {
    updates.stop()
    watcher.stop()
    void server.stop()
  })

  serveRenderer(rendererFolder())
  createMainWindow()
  ready = true
  for (const url of pendingLinks.splice(0)) openLink(url)

  const marketplaceFolder = path.join(userData, CLAUDE_MARKETPLACE_FOLDER)
  const plugin = bundledPluginConfig()
  void writeMarketplace(
    marketplaceFolder,
    marketplaceFiles({ version: app.getVersion(), port, ...plugin, skills }),
  ).then(
    () => publish({ marketplacePath: marketplaceFolder }),
    () => undefined,
  )
  void updates.check()
  publish(await startAgentServer(server, port))
}

if (app.requestSingleInstanceLock()) {
  registerProtocolClient()
  app.on('second-instance', (_event, argv) => {
    const link = findDeepLink(argv)
    if (link) openLink(link)
    else focusWindow()
  })
  app.on('open-url', (event, url) => {
    event.preventDefault()
    openLink(url)
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('activate', () => {
    if (ready && !currentWindow()) createMainWindow()
  })
  void app.whenReady().then(async () => {
    const link = findDeepLink(process.argv)
    if (link) pendingLinks.push(link)
    await start()
  })
} else {
  app.quit()
}
