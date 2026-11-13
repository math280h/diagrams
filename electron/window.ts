import { app, BrowserWindow, Menu, nativeTheme, shell, type WebContents } from 'electron'
import type { WindowColors } from '@/desktop/contract'
import { APP_ORIGIN, originOf } from './app-protocol'
import { APP_NAME, devServerUrl, iconPath, preloadPath } from './paths'
import type { WindowState } from './window-bounds'
import { loadWindowColors, loadWindowState, saveWindowColors, trackWindowState } from './window-state'

const DARK_GROUND = '#000000'
const LIGHT_GROUND = '#ffffff'
const DEFAULT_SIZE = { width: 1440, height: 900 }
const APP_HEADER_HEIGHT_PX = 44
const HEADER_BORDER_PX = 1
const TITLE_BAR_HEIGHT_PX = APP_HEADER_HEIGHT_PX - HEADER_BORDER_PX
const DARK_TITLE_BAR = { color: '#0a0a0a', symbolColor: '#fafafa' }
const LIGHT_TITLE_BAR = { color: '#ffffff', symbolColor: '#0a0a0a' }
const MAC_TRAFFIC_LIGHTS = { x: 16, y: 15 }

const HIDE_WINDOW = process.env.DIAGRAMS_HIDE_WINDOW

/**
 * True when the window never shows, for end-to-end tests. With `offscreen`, the page renders at the full frame rate
 * without a native window. With `native`, Chromium throttles the frames of the hidden window, as for a minimized one.
 */
export const windowHidden = HIDE_WINDOW === 'offscreen' || HIDE_WINDOW === 'native'

export interface WindowHooks {
  /** Runs for the renderer of each new window. */
  attach(contents: WebContents): void
  /** Runs before a window closes. The window closes when the promise settles. */
  beforeClose(): Promise<void>
  focused(): void
  /** Runs when the page moves in its history. */
  navigated(state: { canGoBack: boolean; canGoForward: boolean }): void
  /** Runs when the window is minimized or hidden, when it comes back, and after each page load. */
  visibilityChanged(visible: boolean): void
}

/** How a window shows: in front of other windows with focus, or without focus. */
export type WindowShow = 'focus' | 'inactive'

interface MainWindow {
  window: BrowserWindow
  readyToShow: boolean
  showWhenReady: WindowShow | null
  stateToRestore: WindowState | null
  unseenAgentWindow: boolean
  closed: Promise<void> | null
}

let hooks: WindowHooks | null = null
let main: MainWindow | null = null
let lastClosedUnseen = false
let quitting = false
let closedForQuit = false

app.on('before-quit', () => {
  quitting = true
})

export function setWindowHooks(next: WindowHooks) {
  hooks = next
}

function currentMain(): MainWindow | null {
  return main && !main.window.isDestroyed() ? main : null
}

export function currentWindow() {
  return currentMain()?.window ?? null
}

function restoreSavedState(entry: MainWindow) {
  const state = entry.stateToRestore
  if (!state) return
  entry.stateToRestore = null
  if (state.fullScreen) entry.window.setFullScreen(true)
  else if (state.maximized) entry.window.maximize()
}

// On Windows, a window that maximizes or goes full screen takes the focus from the active window.
function present(entry: MainWindow, show: WindowShow) {
  entry.unseenAgentWindow = false
  if (windowHidden) return
  const { window } = entry
  void app.dock?.show()
  if (show === 'inactive') {
    if (!window.isVisible()) window.showInactive()
    return
  }
  restoreSavedState(entry)
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

function requestShow(entry: MainWindow, show: WindowShow) {
  if (entry.readyToShow) present(entry, show)
  else if (entry.showWhenReady !== 'focus') entry.showWhenReady = show
}

/** Returns the origin of the renderer page: the dev server in development, the app scheme otherwise. */
export function rendererOrigin() {
  const dev = devServerUrl()
  return dev ? originOf(dev) : APP_ORIGIN
}

/**
 * Creates the main window.
 *
 * @param show - How the window shows when its page is ready. With `null`, it stays hidden for agent calls.
 */
export function createMainWindow(show: WindowShow | null = 'focus'): BrowserWindow {
  if (process.platform !== 'darwin' && !devServerUrl()) Menu.setApplicationMenu(null)
  const state = loadWindowState()
  const colors = loadWindowColors()
  if (colors) nativeTheme.themeSource = colors.scheme
  const dark = nativeTheme.shouldUseDarkColors
  const titleBar = colors
    ? { color: colors.controls, symbolColor: colors.symbols }
    : dark
      ? DARK_TITLE_BAR
      : LIGHT_TITLE_BAR
  const icon = iconPath()
  const window = new BrowserWindow({
    ...(state.bounds ?? DEFAULT_SIZE),
    minWidth: 800,
    minHeight: 560,
    show: false,
    skipTaskbar: windowHidden,
    title: APP_NAME,
    ...(icon && { icon }),
    autoHideMenuBar: true,
    backgroundColor: colors?.background ?? (dark ? DARK_GROUND : LIGHT_GROUND),
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { titleBarOverlay: true, trafficLightPosition: MAC_TRAFFIC_LIGHTS }
      : { titleBarOverlay: { ...titleBar, height: TITLE_BAR_HEIGHT_PX } }),
    ...(process.platform === 'win32' && colors?.border ? { accentColor: colors.border } : {}),
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false,
      offscreen: HIDE_WINDOW === 'offscreen',
    },
  })
  const entry: MainWindow = {
    window,
    readyToShow: false,
    showWhenReady: show,
    stateToRestore: windowHidden ? null : state,
    unseenAgentWindow: show === null,
    closed: null,
  }
  window.once('ready-to-show', () => {
    entry.readyToShow = true
    if (entry.showWhenReady) present(entry, entry.showWhenReady)
  })
  trackWindowState(window, () => entry.stateToRestore === null)
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (originOf(url) !== rendererOrigin()) event.preventDefault()
  })
  window.on('page-title-updated', (event) => event.preventDefault())
  const reportNavigation = () => {
    const history = window.webContents.navigationHistory
    hooks?.navigated({ canGoBack: history.canGoBack(), canGoForward: history.canGoForward() })
  }
  window.webContents.on('did-navigate-in-page', reportNavigation)
  window.webContents.on('did-finish-load', reportNavigation)
  const reportVisibility = () => hooks?.visibilityChanged(windowHidden || (window.isVisible() && !window.isMinimized()))
  window.on('minimize', reportVisibility)
  window.on('restore', reportVisibility)
  window.on('hide', reportVisibility)
  window.on('show', reportVisibility)
  window.webContents.on('did-finish-load', reportVisibility)

  window.on('close', (event) => {
    if (entry.closed || closedForQuit || !hooks) return
    // Electron cancels the quit when a window prevents its close.
    event.preventDefault()
    entry.closed = new Promise((resolve) => window.once('closed', () => resolve()))
    void hooks
      .beforeClose()
      .catch(() => undefined)
      .then(() => {
        window.destroy()
        if (quitting) app.quit()
      })
  })
  window.on('focus', () => {
    restoreSavedState(entry)
    hooks?.focused()
  })
  window.on('closed', () => {
    if (main !== entry) return
    lastClosedUnseen = entry.unseenAgentWindow
    main = null
  })

  main = entry
  hooks?.attach(window.webContents)
  void window.loadURL(devServerUrl() ?? `${APP_ORIGIN}/index.html`)
  return window
}

/** Runs {@link WindowHooks.beforeClose} now. After it, the windows close at once when the app quits. */
export async function prepareQuit() {
  await hooks?.beforeClose().catch(() => undefined)
  closedForQuit = true
}

/**
 * Shows the main window in front of other windows, and creates it if it does not exist. A window that closes now
 * closes first, and a new window shows after that.
 */
export function focusWindow() {
  const entry = currentMain()
  if (!entry) createMainWindow('focus')
  else if (entry.closed) void entry.closed.then(focusWindow)
  else requestShow(entry, 'focus')
}

/**
 * Makes sure that a main window exists for an agent call. A new window stays hidden without `show`. When the window
 * closes now, the promise resolves after a new window starts.
 *
 * @param show - How a window that the user cannot see shows. A minimized window stays minimized.
 */
export async function prepareAgentWindow(show: WindowShow | null) {
  const closing = currentMain()?.closed
  if (closing) await closing
  const entry = currentMain()
  if (!entry) {
    createMainWindow(show)
    return
  }
  if (show && !entry.window.isVisible() && !entry.window.isMinimized()) requestShow(entry, show)
}

/** Closes the main window if it opened for agent calls and has not shown. */
export function closeUnseenWindow() {
  const entry = currentMain()
  if (entry?.unseenAgentWindow) entry.window.close()
}

/** Tells whether the last main window closed before it showed: a window that opened for agent calls. */
export function closedUnseen() {
  return lastClosedUnseen
}

/**
 * Gives the window the colours of the theme and keeps them for the next start. macOS draws its own window buttons,
 * and only Windows colours the window border.
 */
export function setWindowColors(colors: WindowColors) {
  nativeTheme.themeSource = colors.scheme
  saveWindowColors(colors)
  const window = currentWindow()
  if (!window) return
  window.setBackgroundColor(colors.background)
  if (process.platform !== 'darwin') {
    window.setTitleBarOverlay({ color: colors.controls, symbolColor: colors.symbols, height: TITLE_BAR_HEIGHT_PX })
  }
  if (process.platform === 'win32') window.setAccentColor(colors.border)
}
