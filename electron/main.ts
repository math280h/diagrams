import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { app, dialog, session, shell } from 'electron'
import electronUpdater from 'electron-updater'
import {
  AGENT_ENDPOINT,
  AGENT_HOST,
  AGENT_PORT,
  AGENT_PORTS,
  CLAUDE_MARKETPLACE_FOLDER,
  DEEP_LINK_SCHEME,
  DEV_ORIGINS,
  DIAGRAM_FILE_SUFFIX,
  FIRST_DEV_AGENT_PORT,
  HANDOFF_TTL_MS,
  PREVIEW_APP_LABEL,
  WEBSITE_ORIGIN,
} from '@/desktop/constants'
import type { AgentInfo } from '@/desktop/contract'
import { createHandoffCodes, mountHandoff } from './agent/handoff'
import { marketplaceFiles, writeMarketplace } from './agent/marketplace'
import { loadAgentPort, nextFreeAgentPort, saveAgentPort } from './agent/port'
import { createAgentServer, portIsFree, startAgentServer } from './agent/server'
import { buildInstructions, bundledPluginConfig, bundledSkillFiles, loadSkills, registerSkills } from './agent/skills'
import { createToken, loadToken } from './agent/token'
import { appAbout } from './about'
import { registerAppScheme, serveRenderer } from './app-protocol'
import { findDeepLink, parseReceiveLink } from './deep-link'
import { createCaptureService } from './capture'
import { registerIpc } from './ipc'
import { configurePaths, diagramsFolder, iconPath, rendererFolder } from './paths'
import { parseRenderArgs, RENDER_USAGE, RenderUsageError, type RenderArgs } from './render-args'
import { isolateRender, runRender } from './render-cli'
import { createRendererRpc } from './renderer-rpc'
import { createDiagramFiles } from './storage/diagram-files'
import { committedText } from './storage/git'
import { createLinkedFiles, isLinkedId } from './storage/linked-files'
import { watchDiagramFolder, watchLinkedFiles } from './storage/watcher'
import { createUpdates, updatePolicy, type UpdatePolicy } from './updates'
import { layoutGraphviz } from './graphviz'
import {
  createMainWindow,
  currentWindow,
  focusWindow,
  prepareQuit,
  rendererOrigin,
  setTitleBarColors,
  setWindowHooks,
  windowHidden,
} from './window'

const FLUSH_TIMEOUT_MS = 3000
/** The time limit of an agent call in the main process. */
const AGENT_CALL_LIMIT_MS = 10 * 60_000
const HANDOFF_OPEN_TIMEOUT_MS = 20_000
const PORT_RETRY_MS = 2000
/** How long the app waits for its kept agent port, for example while an app that quits still holds it. */
const PORT_GRACE_MS = 10_000
const ALL_PORTS_TAKEN = `Other programs use all the agent ports, ${AGENT_PORTS[0]} to ${AGENT_PORTS.at(-1)}. Agents can connect when one is free.`
const ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set(['clipboard-sanitized-write', 'fullscreen'])

configurePaths()
registerAppScheme()

const codes = createHandoffCodes({ ttlMs: HANDOFF_TTL_MS })
const pendingLinks: string[] = []
let ready = false

function portFromEnvironment(): number | null {
  const value = process.env.DIAGRAMS_AGENT_PORT
  if (value === undefined) return null
  const port = Number(value)
  return Number.isInteger(port) && port > 0 && port < 65_536 ? port : null
}

function agentUrl(port: number) {
  return `http://${AGENT_HOST}:${port}${AGENT_ENDPOINT}`
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
    preview: app.getVersion().includes(`-${PREVIEW_APP_LABEL}.`),
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
  if (windowHidden) app.dock?.hide()
  else if (icon && process.platform === 'darwin') app.dock?.setIcon(icon)
  const userData = app.getPath('userData')
  let port =
    portFromEnvironment() ??
    (await loadAgentPort(userData, app.isPackaged ? AGENT_PORT : FIRST_DEV_AGENT_PORT, portIsFree))
  const files = createDiagramFiles(diagramsFolder(), { trash: (file) => shell.trashItem(file) })
  const rpc = createRendererRpc()
  const watcher = watchDiagramFolder(files, (change) => rpc.emit('files.changed', change))
  const linked = createLinkedFiles(path.join(userData, 'linked-files.json'))
  const linkedWatcher = watchLinkedFiles(linked, (change) => rpc.emit('files.changed', change))
  const linkedPath = (id: string) => {
    const file = linked.pathOf(id)
    if (!file) throw new Error('This diagram is not a linked file.')
    return file
  }
  const skills = loadSkills(bundledSkillFiles())
  let token = loadToken(userData)
  let agent: AgentInfo = {
    state: 'starting',
    port,
    url: agentUrl(port),
    token,
    message: null,
    marketplacePath: null,
    movedFrom: null,
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

  const createServer = (serverPort: number) =>
    createAgentServer({
      version: app.getVersion(),
      port: serverPort,
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
  let server = createServer(port)
  let retry: NodeJS.Timeout | undefined
  let takenSince: number | null = null
  const moveToFreePort = async () => {
    const next = await nextFreeAgentPort(port, portIsFree)
    if (next === null) return false
    const from = port
    await server.stop().catch(() => undefined)
    port = next
    saveAgentPort(userData, port)
    server = createServer(port)
    publish({ state: 'starting', port, url: agentUrl(port), message: null, movedFrom: from })
    void writePlugin()
    return true
  }
  const startServer = async (): Promise<void> => {
    clearTimeout(retry)
    const result = await startAgentServer(server, port)
    if (result.state !== 'port-in-use') {
      takenSince = null
      publish(result)
      return
    }
    takenSince ??= Date.now()
    if (Date.now() - takenSince >= PORT_GRACE_MS) {
      if (await moveToFreePort()) {
        takenSince = null
        return startServer()
      }
      publish({ ...result, message: ALL_PORTS_TAKEN })
    } else {
      publish({ ...result, message: `${result.message} The app moves to a free port in a few seconds.` })
    }
    retry = setTimeout(() => void startServer(), PORT_RETRY_MS)
  }

  const marketplaceFolder = path.join(userData, CLAUDE_MARKETPLACE_FOLDER)
  const plugin = bundledPluginConfig()
  const writePlugin = () =>
    writeMarketplace(marketplaceFolder, marketplaceFiles({ version: app.getVersion(), port, ...plugin, skills })).then(
      () => publish({ marketplacePath: marketplaceFolder }),
      () => undefined,
    )

  const capture = createCaptureService()
  registerIpc(
    {
      ...capture.handlers,
      'files.list': async () => {
        const [inFolder, outside] = await Promise.all([files.readAll(), linked.readAll()])
        linkedWatcher.sync()
        return { folder: files.folder, files: [...inFolder, ...outside] }
      },
      'files.write': async ({ id, text }) => {
        await (isLinkedId(id) ? linked.write(id, text) : files.write(id, text))
        return null
      },
      'files.remove': async ({ id, trash }) => {
        await (isLinkedId(id) ? linked.unlink(id) : files.remove(id, { trash }))
        linkedWatcher.sync()
        return null
      },
      'files.open': async () => {
        const window = currentWindow()
        const options = {
          title: 'Open diagram files',
          properties: ['openFile', 'multiSelections'] as ('openFile' | 'multiSelections')[],
          filters: [{ name: 'Diagram files', extensions: ['json'] }],
        }
        const picked = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
        if (picked.canceled) return []
        const opened = await Promise.all(picked.filePaths.map((file) => linked.link(file)))
        linkedWatcher.sync()
        return opened
      },
      'files.saveAs': async ({ name, text }) => {
        const window = currentWindow()
        const options = {
          title: 'Save the diagram as a file',
          defaultPath: `${name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Diagram'}${DIAGRAM_FILE_SUFFIX}`,
          filters: [{ name: 'Diagram files', extensions: ['json'] }],
        }
        const picked = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options)
        if (picked.canceled || !picked.filePath) return null
        const created = await linked.create(picked.filePath, text)
        linkedWatcher.sync()
        return created
      },
      'files.show': async ({ id }) => {
        shell.showItemInFolder(linkedPath(id))
        return null
      },
      'files.committed': async ({ id }) => ({ text: await committedText(linkedPath(id)) }),
      'files.reveal': async () => {
        await shell.openPath(files.folder)
        return null
      },
      'app.about': async () => appAbout(),
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
      'layout.graphviz': layoutGraphviz,
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
      await Promise.all([files.drain(), linked.drain()])
    },
    focused: () => {
      watcher.rescan()
      linkedWatcher.rescan()
    },
    navigated: (state) => rpc.emit('window.navigation', state),
    visibilityChanged: (visible) => rpc.emit('window.visibility', { visible }),
  })

  app.on('will-quit', () => {
    capture.dispose()
    updates.stop()
    watcher.stop()
    linkedWatcher.stop()
    clearTimeout(retry)
    void server.stop()
  })

  serveRenderer(rendererFolder())
  createMainWindow()
  ready = true
  for (const url of pendingLinks.splice(0)) openLink(url)

  void writePlugin()
  void updates.check()
  await startServer()
}

function readRenderArgs(): RenderArgs | null | 'invalid' {
  try {
    return parseRenderArgs(process.argv)
  } catch (error) {
    if (!(error instanceof RenderUsageError)) throw error
    process.stderr.write(`${error.message}\n\n${RENDER_USAGE}\n`)
    return 'invalid'
  }
}

const renderArgs = readRenderArgs()
if (renderArgs === 'invalid') {
  app.exit(2)
} else if (renderArgs) {
  const cleanup = isolateRender()
  void app
    .whenReady()
    .then(() => runRender(renderArgs))
    .then((code) => {
      cleanup()
      app.exit(code)
    })
} else if (app.requestSingleInstanceLock()) {
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
