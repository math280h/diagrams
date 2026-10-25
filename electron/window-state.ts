import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { app, screen, type BrowserWindow } from 'electron'
import { parseWindowState, restorableBounds, type WindowState } from './window-bounds'

const STATE_FILE = 'window-state.json'
const SAVE_DELAY_MS = 400

function statePath() {
  return path.join(app.getPath('userData'), STATE_FILE)
}

/** Reads the last window state. Bounds on a screen that is not connected now become `null`. */
export function loadWindowState(): WindowState {
  let state: WindowState
  try {
    state = parseWindowState(JSON.parse(readFileSync(statePath(), 'utf8')))
  } catch {
    return { bounds: null, maximized: false, fullScreen: false }
  }
  const workAreas = screen.getAllDisplays().map((display) => display.workArea)
  return { ...state, bounds: state.bounds ? restorableBounds(state.bounds, workAreas) : null }
}

function saveWindowState(window: BrowserWindow) {
  if (window.isDestroyed()) return
  const state: WindowState = {
    bounds: window.getNormalBounds(),
    maximized: window.isMaximized(),
    fullScreen: window.isFullScreen(),
  }
  try {
    mkdirSync(path.dirname(statePath()), { recursive: true })
    writeFileSync(statePath(), JSON.stringify(state))
  } catch {
    return
  }
}

/** Saves the position, size and maximized state of the window when they change and when it closes. */
export function trackWindowState(window: BrowserWindow) {
  let timer: NodeJS.Timeout | undefined
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(() => saveWindowState(window), SAVE_DELAY_MS)
  }
  window.on('resize', schedule)
  window.on('move', schedule)
  window.on('maximize', schedule)
  window.on('unmaximize', schedule)
  window.on('enter-full-screen', schedule)
  window.on('leave-full-screen', schedule)
  window.on('close', () => {
    clearTimeout(timer)
    saveWindowState(window)
  })
}
