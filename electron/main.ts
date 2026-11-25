import { existsSync, readFileSync } from 'node:fs'
import { homedir, hostname, userInfo } from 'node:os'
import path from 'node:path'
import { app, type BrowserWindow, dialog, Menu, powerMonitor, session, shell, webContents } from 'electron'
import electronUpdater from 'electron-updater'
import { TOOL_DEFINITIONS } from '@/agent/tool-definitions'
import {
  AGENT_ENDPOINT,
  AGENT_HOST,
  AGENT_PORT,
  AGENT_PORTS,
  BACKGROUND_ARG,
  CLAUDE_MARKETPLACE_FOLDER,
  DEEP_LINK_SCHEME,
  DEV_ORIGINS,
  FIRST_DEV_AGENT_PORT,
  HANDOFF_TTL_MS,
  PREVIEW_APP_LABEL,
  REPOSITORY_URL,
} from '@/desktop/constants'
import { BUILD, releaseLinks, repositoryName } from '@/desktop/build-config'
import type { AgentInfo, GitHubSignIn, TrayHost } from '@/desktop/contract'
import { showsStartedNotice, showsStillRunningNotice, trayIconShows } from '@/desktop/keep-running'
import { createHandoffCodes, mountHandoff } from './agent/handoff'
import { marketplaceFiles, writeMarketplace } from './agent/marketplace'
import { loadAgentPort, nextFreeAgentPort, saveAgentPort } from './agent/port'
import { createAgentServer, portIsFree, startAgentServer } from './agent/server'
import { buildInstructions, bundledPluginConfig, bundledSkillFiles, loadSkills, registerSkills } from './agent/skills'
import { createToken, loadToken } from './agent/token'
import { appAbout } from './about'
import { runningAppImage } from './appimage'
import { registerAppImageLinks } from './appimage-links'
import { agentWindowShow, createIdleClose } from './agent-window'
import { appMenuTemplate, type HelpLink, runEditCommand } from './app-menu'
import { registerAppScheme, serveRenderer } from './app-protocol'
import {
  addWebsite,
  APP_SETTINGS_FILE,
  createAppSettings,
  publicSettings,
  type AppSettingsStore,
  removeWebsite,
  setShareWebsite,
} from './app-settings'
import { createBackground } from './background'
import { findDeepLink, isConnectAgentLink, parseReceiveLink } from './deep-link'
import { createCaptureService } from './capture'
import { registerIpc } from './ipc'
import { createLoginItem, startedAtLogin, type LoginItem } from './login-item'
import { configurePaths, devServerUrl, diagramsFolder, iconPath, rendererFolder } from './paths'
import { parseRenderArgs, RENDER_USAGE, RenderUsageError, type RenderArgs } from './render-args'
import { isolateRender, runRender } from './render-cli'
import { createRendererRpc } from './renderer-rpc'
import { setupReports, startCrashReporter } from './reports/setup'
import { createGitHubAuth, GITHUB_SIGN_IN_FILE, secretFile, type GitHubAuth } from './github-auth'
import { createDiagramFiles } from './storage/diagram-files'
import { TrashError, writeFileAtomic } from './storage/file-queue'
import { committedText } from './storage/git'
import { createLinkedFiles, isLinkedId } from './storage/linked-files'
import { createPickedFiles } from './storage/picked-files'
import { createThemeFiles, watchThemeFolder } from './storage/theme-files'
import { watchDiagramFolder, watchLinkedFiles } from './storage/watcher'
import { checkUpdateRepository, repositoryFeed } from './update-repository'
import { createTrayHostWatch } from './tray-host'
import { createUpdates, updatePolicy, type UpdatePolicy } from './updates'
import { layoutGraphviz } from './graphviz'
import { type CloseDialogs, confirmUnsavedClose, diagramFileName } from './unsaved-close'
import {
  cancelQuit,
  closedUnseen,
  closeUnseenWindow,
  createMainWindow,
  currentWindow,
  endSession,
  focusWindow,
  prepareAgentWindow,
  prepareQuit,
  reloadMainWindow,
  rendererOrigin,
  setRendererUnsaved,
  setWindowColors,
  setWindowHooks,
  windowHidden,
} from './window'

const FLUSH_TIMEOUT_MS = 3000
const DIAGRAM_FILE_FILTERS = [{ name: 'Diagram files', extensions: ['json'] }]
const COPY_FILE_MODE = 0o644
/** The time limit of an agent call in the main process. */
const AGENT_CALL_LIMIT_MS = 10 * 60_000
const HANDOFF_OPEN_TIMEOUT_MS = 20_000
const AGENT_SETUP_OPEN_TIMEOUT_MS = 20_000
const MENU_COMMAND_TIMEOUT_MS = 20_000
const MENU_EDIT_TIMEOUT_MS = 2000
const UNSEEN_AGENT_WINDOW_IDLE_MS = 5 * 60_000
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
let openAgentSetup: () => void = () => undefined

function portFromEnvironment(): number | null {
  const value = process.env.DIAGRAMS_AGENT_PORT
  if (value === undefined) return null
  const port = Number(value)
  return Number.isInteger(port) && port > 0 && port < 65_536 ? port : null
}

function agentUrl(port: number) {
  return `http://${AGENT_HOST}:${port}${AGENT_ENDPOINT}`
}

function registerProtocolClient() {
  if (process.env.DIAGRAMS_REGISTER_PROTOCOL === '0') return
  if (!process.defaultApp) {
    app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME)
    if (process.platform === 'linux') void registerAppImageLinks().catch(() => undefined)
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
  if (isConnectAgentLink(url)) openAgentSetup()
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
    appImage: runningAppImage() !== null,
    macSigned: manifest.macSigned === true,
    preview: app.getVersion().includes(`-${PREVIEW_APP_LABEL}.`),
  })
}

function addLoginItemOnce(loginItem: LoginItem, settings: AppSettingsStore) {
  if (settings.get().openAtLoginAdded || !loginItem.installed()) {
    loginItem.sync()
    return
  }
  try {
    loginItem.set(true)
  } catch {
    return
  }
  settings.update({ openAtLoginAdded: true })
}

function systemNames(): string[] {
  let user = ''
  try {
    user = userInfo().username
  } catch {
    user = ''
  }
  return [homedir(), hostname(), user]
}

function nativeCloseDialogs(window: BrowserWindow, signal: AbortSignal): CloseDialogs {
  return {
    ask: async (question) =>
      (await dialog.showMessageBox(window, { type: 'warning', noLink: true, signal, ...question })).response,
    pickFile: async (defaultName) => {
      const picked = await dialog.showSaveDialog(window, {
        title: 'Save a copy of the diagram',
        defaultPath: path.join(app.getPath('documents'), defaultName),
        filters: DIAGRAM_FILE_FILTERS,
      })
      return picked.canceled || !picked.filePath ? null : picked.filePath
    },
    write: (file, text) => writeFileAtomic(file, text, COPY_FILE_MODE),
    showError: async (message, detail) => {
      await dialog.showMessageBox(window, { type: 'error', message, detail, signal })
    },
  }
}

function restrictPermissions() {
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) =>
    callback(ALLOWED_PERMISSIONS.has(permission)),
  )
  session.defaultSession.setPermissionCheckHandler((_contents, permission) => ALLOWED_PERMISSIONS.has(permission))
}

async function start() {
  restrictPermissions()
  const atLogin = startedAtLogin(process.argv)
  const icon = iconPath()
  if (windowHidden) app.dock?.hide()
  else if (icon && process.platform === 'darwin') app.dock?.setIcon(icon)
  const userData = app.getPath('userData')
  const settings = createAppSettings(path.join(userData, APP_SETTINGS_FILE), BUILD.website)
  const loginItem = createLoginItem()
  addLoginItemOnce(loginItem, settings)
  const trayHost = createTrayHostWatch({ platform: process.platform, changed: (host) => background?.setHost(host) })
  const appSettings = (stored = settings.get()) => publicSettings(stored, loginItem.state(), trayHost.current())
  const handoffOrigins = (): readonly string[] =>
    app.isPackaged ? settings.get().websites : [...settings.get().websites, ...DEV_ORIGINS]
  const updateRepository = () => (BUILD.repositoryEditable && settings.get().updateRepository) || BUILD.repository
  const background = windowHidden
    ? null
    : createBackground({ open: () => focusWindow(), quit: () => app.quit(), host: trayHost.current() })
  const followBackground = () => {
    const shown = settings.get().keepRunning || atLogin
    background?.follow(shown)
    trayHost.watch(shown)
  }
  void trayHost.refresh().then((host) => {
    followBackground()
    if (atLogin && showsStartedNotice(process.platform, host)) background?.notify('started')
  })
  if (atLogin) background?.hideDock()
  powerMonitor.on('shutdown', endSession)
  const noticeStillRunning = (host: TrayHost) => {
    if (currentWindow()) return
    const { backgroundNoticeShown } = settings.get()
    if (!showsStillRunningNotice(process.platform, host, backgroundNoticeShown) || !background?.notify()) return
    if (trayIconShows(process.platform, host)) settings.update({ backgroundNoticeShown: true })
  }
  app.on('window-all-closed', () => {
    if (closedUnseen()) return
    if (!settings.get().keepRunning) {
      app.quit()
      return
    }
    background?.hideDock()
    void trayHost.refresh().then(noticeStillRunning)
  })
  const agentCalls = createIdleClose(UNSEEN_AGENT_WINDOW_IDLE_MS, closeUnseenWindow)
  let port =
    portFromEnvironment() ??
    (await loadAgentPort(userData, app.isPackaged ? AGENT_PORT : FIRST_DEV_AGENT_PORT, portIsFree))
  const files = createDiagramFiles(diagramsFolder(), { trash: (file) => shell.trashItem(file) })
  const rpc = createRendererRpc()
  openAgentSetup = () => {
    void rpc.call('app.connectAgent', null, { timeoutMs: AGENT_SETUP_OPEN_TIMEOUT_MS }).catch(() => undefined)
  }
  const watcher = watchDiagramFolder(files, (change) => rpc.emit('files.changed', change))
  const themes = createThemeFiles(files.folder)
  const themeWatcher = watchThemeFolder(themes, () => {
    void themes.list().then((sources) => rpc.emit('themes.changed', sources))
  })
  const linked = createLinkedFiles(path.join(userData, 'linked-files.json'), {
    listedInFolder: async (linkedFiles) => (await files.idsOf(linkedFiles)).map((id) => id !== null),
  })
  const picked = createPickedFiles(files, linked)
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
  let signedIn = false
  const github: GitHubAuth | null = BUILD.githubApp
    ? createGitHubAuth({
        clientId: BUILD.githubApp,
        store: secretFile(path.join(userData, GITHUB_SIGN_IN_FILE)),
        emit: (info) => {
          rpc.emit('github.info', info)
          const wasSignedIn = signedIn
          signedIn = info.state === 'signed-in'
          if (signedIn !== wasSignedIn) void updates.check()
        },
      })
    : null
  signedIn = github?.info().state === 'signed-in'
  const noGitHub = (): never => {
    throw new Error('This build has no GitHub sign-in.')
  }
  const accessToken = github && (() => github.accessToken())
  const updateFeed = async () => {
    const repository = updateRepository()
    return accessToken ? repositoryFeed(repository, { accessToken }) : { repository, token: null }
  }
  const policy = currentUpdatePolicy()
  const updates = createUpdates({
    updater: policy.kind === 'none' ? null : electronUpdater.autoUpdater,
    policy,
    currentVersion: app.getVersion(),
    buildRepository: BUILD.repository,
    repository: updateRepository(),
    feed: updateFeed,
    emit: (info) => rpc.emit('update.info', info),
    prepareQuit,
    cancelQuit,
    automatic: settings.get().autoUpdateCheck,
  })

  const createServer = (serverPort: number) =>
    createAgentServer({
      version: app.getVersion(),
      port: serverPort,
      instructions: buildInstructions(skills),
      token: () => token,
      callTool: async (tool, args, signal) => {
        const end = agentCalls.start()
        try {
          const { readOnlyHint } = TOOL_DEFINITIONS[tool].annotations
          await prepareAgentWindow(agentWindowShow(settings.get().agentWindow, readOnlyHint))
          return await rpc.call('agent.call', { tool, args }, { timeoutMs: AGENT_CALL_LIMIT_MS, signal })
        } finally {
          end()
        }
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
  const reports = setupReports({
    userData,
    sensitive: () => [...systemNames(), files.folder, userData, app.getPath('temp'), token, ...codes.pending()],
    emitCrashes: (crashes) => rpc.emit('reports.crashes', crashes),
    saveDialogParent: currentWindow,
  })
  registerIpc(
    {
      ...capture.handlers,
      ...reports,
      'files.list': async () => {
        const [inFolder, outside] = await Promise.all([files.readAll(), linked.readAll()])
        linkedWatcher.sync()
        return { folder: files.folder, files: [...inFolder, ...outside], linkedFilesReset: linked.takeReset() }
      },
      'files.write': async ({ id, text }) => {
        await (isLinkedId(id) ? linked.write(id, text) : files.write(id, text))
        return null
      },
      'files.remove': async ({ id, trash }) => {
        try {
          await (isLinkedId(id) ? linked.unlink(id) : files.remove(id, { trash }))
        } catch (error) {
          if (error instanceof TrashError) return { kind: 'trash-failed', message: error.message }
          throw error
        } finally {
          linkedWatcher.sync()
        }
        return { kind: 'removed' }
      },
      'files.open': async () => {
        const window = currentWindow()
        const options = {
          title: 'Open diagram files',
          properties: ['openFile', 'multiSelections'] as ('openFile' | 'multiSelections')[],
          filters: DIAGRAM_FILE_FILTERS,
        }
        const chosen = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
        if (chosen.canceled) return []
        try {
          return await picked.open(chosen.filePaths)
        } finally {
          linkedWatcher.sync()
        }
      },
      'files.saveAs': async ({ name, text }) => {
        const window = currentWindow()
        const options = {
          title: 'Save the diagram as a file',
          defaultPath: diagramFileName(name),
          filters: DIAGRAM_FILE_FILTERS,
        }
        const chosen = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options)
        if (chosen.canceled || !chosen.filePath) return null
        const saved = await picked.saveAs(chosen.filePath, text)
        linkedWatcher.sync()
        return saved
      },
      'files.show': async ({ id }) => {
        shell.showItemInFolder(linkedPath(id))
        return null
      },
      'files.showDamagedList': async () => {
        const copy = linked.damagedCopy()
        if (!copy) throw new Error('The app did not keep a copy of the damaged list.')
        shell.showItemInFolder(copy)
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
      'window.setColors': async (colors) => {
        setWindowColors(colors)
        return null
      },
      'themes.list': () => themes.list(),
      'themes.write': async (source) => {
        await themes.write(source)
        return null
      },
      'themes.reveal': async () => {
        await shell.openPath(await themes.ensureFolder())
        return null
      },
      'app.settings': async () => {
        await trayHost.refresh()
        return appSettings()
      },
      'app.setKeepRunning': async ({ keepRunning }) => {
        const next = settings.update({ keepRunning })
        followBackground()
        return appSettings(next)
      },
      'app.setOpenAtLogin': async ({ openAtLogin }) => {
        loginItem.set(openAtLogin)
        return appSettings()
      },
      'app.setAgentWindow': async ({ agentWindow }) => appSettings(settings.update({ agentWindow })),
      'app.setAutoUpdateCheck': async ({ autoUpdateCheck }) => {
        const next = settings.update({ autoUpdateCheck })
        updates.setAutomatic(autoUpdateCheck)
        return appSettings(next)
      },
      'app.addWebsite': async ({ website }) => appSettings(settings.update((current) => addWebsite(current, website))),
      'app.removeWebsite': async ({ website }) =>
        appSettings(settings.update((current) => removeWebsite(current, website))),
      'app.setShareWebsite': async ({ website }) =>
        appSettings(settings.update((current) => setShareWebsite(current, website))),
      'app.quit': async () => {
        setImmediate(() => app.quit())
        return null
      },
      'app.setUnsaved': async ({ unsaved }) => {
        setRendererUnsaved(unsaved)
        return null
      },
      'layout.graphviz': layoutGraphviz,
      'update.info': async () => updates.info(),
      'update.check': () => updates.check(),
      'update.install': async () => {
        await updates.install()
        return null
      },
      'update.setRepository': async ({ repository }) => {
        if (!BUILD.repositoryEditable) throw new Error('This build gets its updates from one repository only.')
        const name = repository === null ? BUILD.repository : repositoryName(repository)
        if (name === null) throw new Error('Enter a GitHub repository as owner/name.')
        if (name !== BUILD.repository) {
          const feed = await repositoryFeed(name, { accessToken })
          if (feed === 'sign-in') {
            throw new Error(
              `GitHub has no public repository ${name}. For a private repository, sign in to GitHub first.`,
            )
          }
          await checkUpdateRepository(name, { token: feed.token, platform: process.platform })
        }
        settings.update({ updateRepository: name === BUILD.repository ? null : name })
        const info = updates.setRepository(name)
        void updates.check()
        return info
      },
      'github.info': async (): Promise<GitHubSignIn> => github?.info() ?? noGitHub(),
      'github.signIn': async () => (github ?? noGitHub()).signIn(),
      'github.cancelSignIn': async () => (github ?? noGitHub()).cancelSignIn(),
      'github.signOut': async () => (github ?? noGitHub()).signOut(),
    },
    rendererOrigin,
  )

  setWindowHooks({
    attach: (contents) => rpc.attach(contents),
    beforeClose: async () => {
      const flushed = await rpc.call('app.flush', null, { timeoutMs: FLUSH_TIMEOUT_MS }).catch(() => null)
      await Promise.all([files.drain(), linked.drain()])
      return flushed?.unsaved ?? null
    },
    confirmUnsavedClose: (window, unsaved, signal, action) =>
      confirmUnsavedClose(unsaved, nativeCloseDialogs(window, signal), action),
    focused: () => {
      watcher.rescan()
      linkedWatcher.rescan()
      void themeWatcher.rescan()
    },
    navigated: (state) => rpc.emit('window.navigation', state),
    visibilityChanged: (visible) => rpc.emit('window.visibility', { visible }),
  })

  app.on('will-quit', () => {
    capture.dispose()
    trayHost.stop()
    agentCalls.stop()
    updates.stop()
    watcher.stop()
    linkedWatcher.stop()
    themeWatcher.stop()
    clearTimeout(retry)
    void server.stop()
  })

  const helpLinks: Record<HelpLink, () => string> = {
    website: () => BUILD.website,
    'whats-new': () => releaseLinks(updateRepository()).releases,
    'source-code': () => REPOSITORY_URL,
  }
  const menu = appMenuTemplate(
    process.platform,
    { development: devServerUrl() !== null, updates: policy.kind !== 'none' },
    {
      run: (command) => {
        focusWindow()
        void rpc.call('menu.command', { command }, { timeoutMs: MENU_COMMAND_TIMEOUT_MS }).catch(() => undefined)
      },
      edit: (command) =>
        void runEditCommand(
          command,
          webContents.getFocusedWebContents(),
          currentWindow()?.webContents ?? null,
          async (sent) => (await rpc.call('menu.edit', { command: sent }, { timeoutMs: MENU_EDIT_TIMEOUT_MS })).handled,
        ),
      open: (link) => void shell.openExternal(helpLinks[link]()),
      reload: (ignoreCache) => void reloadMainWindow(ignoreCache),
    },
  )
  if (menu) Menu.setApplicationMenu(Menu.buildFromTemplate(menu))

  serveRenderer(rendererFolder())
  if (!atLogin) createMainWindow()
  ready = true
  for (const url of pendingLinks.splice(0)) openLink(url)

  void writePlugin()
  updates.start()
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
  startCrashReporter()
  registerProtocolClient()
  app.on('second-instance', (_event, argv) => {
    const link = findDeepLink(argv)
    if (link) openLink(link)
    else if (!argv.includes(BACKGROUND_ARG)) focusWindow()
  })
  app.on('open-url', (event, url) => {
    event.preventDefault()
    openLink(url)
  })
  app.on('activate', (_event, hasVisibleWindows) => {
    if (ready && !hasVisibleWindows) focusWindow()
  })
  void app.whenReady().then(async () => {
    const link = findDeepLink(process.argv)
    if (link) pendingLinks.push(link)
    await start()
  })
} else {
  app.quit()
}
