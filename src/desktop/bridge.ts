import { CAPTURE_HASH } from './constants'
import type { DesktopApi } from './contract'

declare global {
  interface Window {
    desktop?: DesktopApi
  }
}

/** Returns the desktop API, or `null` when the app runs as a website. */
export function desktopApi(): DesktopApi | null {
  return typeof window === 'undefined' ? null : (window.desktop ?? null)
}

export function isDesktop() {
  return desktopApi() !== null
}

/** Tells whether this page is the hidden window that renders export stages for the native capture. */
export function isCaptureWindow() {
  return isDesktop() && window.location.hash === CAPTURE_HASH
}
