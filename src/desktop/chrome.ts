import { useEffect } from 'react'
import { create } from 'zustand'
import type { ThemeMode } from '@/store/settings-store'
import type { Theme } from '@/themes/schema'
import { desktopApi } from './bridge'
import { HEX_COLOR_PATTERN } from './constants'
import type { WindowColors } from './contract'

const MOUSE_BACK = 3
const MOUSE_FORWARD = 4

export const useDesktopNavigation = create(() => ({ canGoBack: false, canGoForward: false }))

const SHORT_HEX_COLOR = /^#([\da-f])([\da-f])([\da-f])$/i

/** Returns a CSS colour in the `#rrggbb` form when it is a short hex colour such as `#fff`, and else as it is. */
export function longHexColor(color: string): string {
  const short = SHORT_HEX_COLOR.exec(color)
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : color
}

function cssColor(name: string) {
  // The CSS minifier of the build writes #ffffff as #fff.
  return longHexColor(getComputedStyle(document.documentElement).getPropertyValue(name).trim())
}

function isHistoryShortcut(event: KeyboardEvent, platform: string): 'back' | 'forward' | null {
  if (platform === 'darwin') {
    if (!event.metaKey || event.altKey || event.ctrlKey) return null
    if (event.key === '[') return 'back'
    if (event.key === ']') return 'forward'
    return null
  }
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null
  if (event.key === 'ArrowLeft') return 'back'
  if (event.key === 'ArrowRight') return 'forward'
  return null
}

/**
 * Adapts the page to the desktop window. It marks the platform on the root element. The mouse side buttons and the
 * history shortcuts of the platform move back and forward.
 */
export function useDesktopChrome() {
  const desktop = desktopApi()

  useEffect(() => {
    if (!desktop) return
    document.documentElement.dataset.desktop = desktop.platform
    const stopNavigation = desktop.on('window.navigation', (state) => useDesktopNavigation.setState(state))
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      const direction = isHistoryShortcut(event, desktop.platform)
      if (!direction) return
      event.preventDefault()
      if (direction === 'back') window.history.back()
      else window.history.forward()
    }
    const onMouse = (event: MouseEvent) => {
      if (event.button !== MOUSE_BACK && event.button !== MOUSE_FORWARD) return
      event.preventDefault()
      if (event.button === MOUSE_BACK) window.history.back()
      else window.history.forward()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mouseup', onMouse)
    return () => {
      stopNavigation()
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mouseup', onMouse)
    }
  }, [desktop])
}

const ALPHA_HEX_COLOR = /^#[\da-f]{8}$/i

function opaqueColor(color: string): string {
  return ALPHA_HEX_COLOR.test(color) ? color.slice(0, 7) : color
}

/**
 * Returns the colours of the desktop window for a theme. Without window colours, the window buttons take the colours of
 * the header.
 *
 * @param read - Returns the value of an app colour variable such as `--panel`.
 * @returns The colours, or `null` if a colour is not a hex colour.
 */
export function windowColorsOf(theme: Theme, mode: ThemeMode, read: (name: string) => string): WindowColors | null {
  const colors = {
    controls: theme.window.controls ?? opaqueColor(read('--panel')),
    symbols: theme.window.symbols ?? opaqueColor(read('--foreground')),
    background: opaqueColor(read('--background')),
  }
  if (!Object.values(colors).every((color) => HEX_COLOR_PATTERN.test(color))) return null
  return { ...colors, border: theme.window.border ?? null, scheme: mode === 'system' ? 'system' : theme.base }
}

/** Gives the desktop window the colours of the theme. Call it after the page has the colours of the theme. */
export function syncWindowColors(theme: Theme, mode: ThemeMode) {
  const desktop = desktopApi()
  if (!desktop) return
  const colors = windowColorsOf(theme, mode, cssColor)
  if (colors) void desktop.request('window.setColors', colors)
}
