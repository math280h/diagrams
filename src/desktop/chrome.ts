import { useEffect } from 'react'
import { create } from 'zustand'
import { desktopApi } from './bridge'
import { HEX_COLOR_PATTERN } from './constants'

const MOUSE_BACK = 3
const MOUSE_FORWARD = 4

export const useDesktopNavigation = create(() => ({ canGoBack: false, canGoForward: false }))

function cssColor(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
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

/** Colours the window buttons like the header. Call it after the theme of the page changes. */
export function syncTitleBarColors() {
  const desktop = desktopApi()
  if (!desktop) return
  const color = cssColor('--panel')
  const symbolColor = cssColor('--foreground')
  if (HEX_COLOR_PATTERN.test(color) && HEX_COLOR_PATTERN.test(symbolColor)) {
    void desktop.request('window.setTitleBarColors', { color, symbolColor })
  }
}
