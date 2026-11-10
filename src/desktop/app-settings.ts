import { toast } from 'sonner'
import { create } from 'zustand'
import { errorMessage } from '@/lib/error-message'
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
    toast.error('Could not change the setting', { description: errorMessage(error) })
  }
}

export function quitApp() {
  void desktopApi()?.request('app.quit', null)
}
