import { useSyncExternalStore } from 'react'
import { desktopApi } from '@/desktop/bridge'

const listeners = new Set<() => void>()
let windowVisible = true
let stopDesktop: (() => void) | null = null

function notify() {
  for (const listener of listeners) listener()
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  if (listeners.size === 1) {
    document.addEventListener('visibilitychange', notify)
    stopDesktop =
      desktopApi()?.on('window.visibility', ({ visible }) => {
        windowVisible = visible
        notify()
      }) ?? null
  }
  return () => {
    listeners.delete(onChange)
    if (listeners.size > 0) return
    document.removeEventListener('visibilitychange', notify)
    stopDesktop?.()
    stopDesktop = null
  }
}

function pageVisible() {
  return document.visibilityState !== 'hidden' && windowVisible
}

/**
 * Returns false while nobody can see the page: in a browser tab in the background, or in a desktop window that is
 * minimized or hidden.
 */
export function usePageVisible(): boolean {
  return useSyncExternalStore(subscribe, pageVisible, () => true)
}
