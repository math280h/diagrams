import { app, BrowserWindow, Menu, nativeTheme, shell, type WebContents } from 'electron'
import { APP_ORIGIN, originOf } from './app-protocol'
import { APP_NAME, devServerUrl, iconPath, preloadPath } from './paths'
import { loadWindowState, trackWindowState } from './window-state'

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
}

let hooks: WindowHooks | null = null
let mainWindow: BrowserWindow | null = null
let quitting = false
let closedForQuit = false

app.on('before-quit', () => {
  quitting = true
})

export function setWindowHooks(next: WindowHooks) {
  hooks = next
}

export function currentWindow() {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

/** Returns the origin of the renderer page: the dev server in development, the app scheme otherwise. */
export function rendererOrigin() {
  const dev = devServerUrl()
  return dev ? originOf(dev) : APP_ORIGIN
}

export function createMainWindow(): BrowserWindow {
  if (process.platform !== 'darwin' && !devServerUrl()) Menu.setApplicationMenu(null)
  const state = loadWindowState()
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
    backgroundColor: nativeTheme.shouldUseDarkColors ? DARK_GROUND : LIGHT_GROUND,
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { titleBarOverlay: true, trafficLightPosition: MAC_TRAFFIC_LIGHTS }
      : {
          titleBarOverlay: {
            ...(nativeTheme.shouldUseDarkColors ? DARK_TITLE_BAR : LIGHT_TITLE_BAR),
            height: TITLE_BAR_HEIGHT_PX,
          },
        }),
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
  window.once('ready-to-show', () => {
    if (windowHidden) return
    if (state.fullScreen) window.setFullScreen(true)
    else if (state.maximized) window.maximize()
    window.show()
  })
  trackWindowState(window)
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

  let closing = false
  window.on('close', (event) => {
    if (closing || closedForQuit || !hooks) return
    // Electron cancels the quit when a window prevents its close.
    event.preventDefault()
    closing = true
    void hooks
      .beforeClose()
      .catch(() => undefined)
      .then(() => {
        window.destroy()
        if (quitting) app.quit()
      })
  })
  window.on('focus', () => hooks?.focused())
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  mainWindow = window
  hooks?.attach(window.webContents)
  void window.loadURL(devServerUrl() ?? `${APP_ORIGIN}/index.html`)
  return window
}

/** Runs {@link WindowHooks.beforeClose} now. After it, the windows close at once when the app quits. */
export async function prepareQuit() {
  await hooks?.beforeClose().catch(() => undefined)
  closedForQuit = true
}

/** Shows the main window in front of other windows, and creates it if it does not exist. */
export function focusWindow() {
  const window = currentWindow() ?? createMainWindow()
  if (windowHidden) return window
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
  return window
}

/** Sets the colours of the window buttons on Windows and Linux. macOS draws its own buttons. */
export function setTitleBarColors(colors: { color: string; symbolColor: string }) {
  if (process.platform === 'darwin') return
  currentWindow()?.setTitleBarOverlay({ ...colors, height: TITLE_BAR_HEIGHT_PX })
}
