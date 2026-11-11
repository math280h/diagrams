import { create } from 'zustand'
import { reportError } from '@/store/problem-store'
import { desktopApi } from './bridge'
import type { AppSettings, MainRequests } from './contract'

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

type SettingsRequest = {
  [M in keyof MainRequests]: MainRequests[M]['output'] extends AppSettings ? M : never
}[keyof MainRequests]

async function changeSettings<M extends SettingsRequest>(
  method: M,
  input: MainRequests[M]['input'],
  problem: { title: string; facts: string[] },
): Promise<boolean> {
  const desktop = desktopApi()
  if (!desktop) return false
  try {
    useAppSettings.setState({ settings: await desktop.request(method, input) })
    return true
  } catch (error) {
    reportError(problem.title, error, { facts: problem.facts })
    return false
  }
}

export function setKeepRunning(keepRunning: boolean) {
  return changeSettings(
    'app.setKeepRunning',
    { keepRunning },
    { title: 'Could not change the setting', facts: [`Keep running: ${keepRunning}`] },
  )
}

export function addWebsite(website: string) {
  return changeSettings(
    'app.addWebsite',
    { website },
    { title: 'Could not add the website', facts: [`Website: ${website}`] },
  )
}

export function removeWebsite(website: string) {
  return changeSettings(
    'app.removeWebsite',
    { website },
    { title: 'Could not remove the website', facts: [`Website: ${website}`] },
  )
}

export function setShareWebsite(website: string) {
  return changeSettings(
    'app.setShareWebsite',
    { website },
    { title: 'Could not change the website of share links', facts: [`Website: ${website}`] },
  )
}

export function quitApp() {
  void desktopApi()?.request('app.quit', null)
}
