import path from 'node:path'
import { app } from 'electron'

export const APP_NAME = 'Diagrams'

/** Sets the user data folder. Call it before the app is ready and before the single instance lock. */
export function configurePaths() {
  app.setName(APP_NAME)
  const userData =
    process.env.DIAGRAMS_USER_DATA ?? (app.isPackaged ? null : path.join(app.getPath('appData'), `${APP_NAME} Dev`))
  if (userData) app.setPath('userData', userData)
}

export function diagramsFolder() {
  return (
    process.env.DIAGRAMS_DATA_DIR ?? path.join(app.getPath('documents'), app.isPackaged ? APP_NAME : `${APP_NAME} Dev`)
  )
}

export function rendererFolder() {
  return path.join(import.meta.dirname, '..', 'dist')
}

/**
 * Returns the app icon for the window and the dock while the app runs without a package, or `null` in a package.
 *
 * A packaged app takes its icon from its executable or bundle.
 */
export function iconPath(): string | null {
  if (app.isPackaged) return null
  return path.join(import.meta.dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
}

export function preloadPath() {
  return path.join(import.meta.dirname, 'preload.cjs')
}

export function devServerUrl() {
  return app.isPackaged ? null : (process.env.VITE_DEV_SERVER_URL ?? null)
}
