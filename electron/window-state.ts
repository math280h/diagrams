import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { app, screen, type BrowserWindow } from 'electron'
import { HEX_COLOR_PATTERN } from '@/desktop/constants'
import type { WindowColors } from '@/desktop/contract'
import { parseWindowState, restorableBounds, type WindowState } from './window-bounds'

const STATE_FILE = 'window-state.json'
const COLORS_FILE = 'window-colors.json'
const SAVE_DELAY_MS = 400
const SCHEMES: ReadonlySet<unknown> = new Set(['system', 'dark', 'light'])

function statePath() {
  return path.join(app.getPath('userData'), STATE_FILE)
}

function colorsPath() {
  return path.join(app.getPath('userData'), COLORS_FILE)
}

function isColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value)
}

/** Returns the window colours of the last theme, or `null` before the first theme. */
export function loadWindowColors(): WindowColors | null {
  try {
    const value = JSON.parse(readFileSync(colorsPath(), 'utf8')) as Partial<WindowColors>
    const { controls, symbols, background, border, scheme } = value
    if (!isColor(controls) || !isColor(symbols) || !isColor(background) || !SCHEMES.has(scheme)) return null
    return { controls, symbols, background, border: isColor(border) ? border : null, scheme: scheme! }
  } catch {
    return null
  }
}

/** Keeps the window colours of the theme for the next start, so that the window opens in the colours of the theme. */
export function saveWindowColors(colors: WindowColors) {
  try {
    mkdirSync(path.dirname(colorsPath()), { recursive: true })
    writeFileSync(colorsPath(), JSON.stringify(colors))
  } catch {
    return
  }
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
