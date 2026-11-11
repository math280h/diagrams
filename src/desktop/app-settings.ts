import { create } from 'zustand'
import { reportError } from '@/store/problem-store'
import { desktopApi } from './bridge'
import type { AppSettings } from './contract'

export const useAppSettings = create<{ settings: AppSettings | null }>(() => ({ settings: null }))

/** Loads the app settings from the main process. */
export function loadAppSettings() {
  void desktopApi()
    ?.request('app.settings', null)
    .then(
      (settings) => useAppSettings.setState({ settings }),
      () => undefined,
    )
}

export async function setKeepRunning(keepRunning: boolean) {
  const desktop = desktopApi()
  if (!desktop) return
  try {
    useAppSettings.setState({ settings: await desktop.request('app.setKeepRunning', { keepRunning }) })
  } catch (error) {
    reportError('Could not change the setting', error, { facts: [`Keep running: ${keepRunning}`] })
  }
}

export function quitApp() {
  void desktopApi()?.request('app.quit', null)
}
