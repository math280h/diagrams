import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addWebsite,
  loadAppSettings,
  quitApp,
  removeWebsite,
  setAgentWindow,
  setKeepRunning,
  setOpenAtLogin,
  setShareWebsite,
  useAppSettings,
} from './app-settings'
import type { AppSettings, DesktopApi } from './contract'

const reportError = vi.hoisted(() => vi.fn())
vi.mock('@/store/problem-store', () => ({ reportError }))

const SETTINGS: AppSettings = {
  keepRunning: true,
  openAtLogin: 'on',
  agentWindow: 'show',
  websites: ['https://draw.thias.dev'],
  shareWebsite: 'https://draw.thias.dev',
}

function installDesktop(answer: (method: string, input: unknown) => Promise<unknown>) {
  const request = vi.fn(answer)
  vi.stubGlobal('window', { desktop: { platform: 'win32', request } as unknown as DesktopApi })
  return request
}

beforeEach(() => {
  useAppSettings.setState({ settings: null })
  reportError.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('app settings', () => {
  it('loads the settings of the main process', async () => {
    const request = installDesktop(async () => SETTINGS)
    loadAppSettings()
    await vi.waitFor(() => expect(useAppSettings.getState().settings).toEqual(SETTINGS))
    expect(request).toHaveBeenCalledWith('app.settings', null)
  })

  it('changes the setting and keeps the answer of the main process', async () => {
    const request = installDesktop(async (_method, input) => ({ ...SETTINGS, ...(input as object) }))
    expect(await setKeepRunning(false)).toBe(true)
    expect(request).toHaveBeenCalledWith('app.setKeepRunning', { keepRunning: false })
    expect(useAppSettings.getState().settings).toEqual({ ...SETTINGS, keepRunning: false })
    expect(await setAgentWindow('hidden')).toBe(true)
    expect(request).toHaveBeenLastCalledWith('app.setAgentWindow', { agentWindow: 'hidden' })
    expect(useAppSettings.getState().settings?.agentWindow).toBe('hidden')
  })

  it('takes the sign-in state from the main process, which reads it from the system', async () => {
    const request = installDesktop(async () => ({ ...SETTINGS, openAtLogin: 'approval' }))
    expect(await setOpenAtLogin(true)).toBe(true)
    expect(request).toHaveBeenCalledWith('app.setOpenAtLogin', { openAtLogin: true })
    expect(useAppSettings.getState().settings?.openAtLogin).toBe('approval')
  })

  it('reports a change that the main process refuses, and keeps the old setting', async () => {
    useAppSettings.setState({ settings: SETTINGS })
    const failure = new Error('The settings file is read-only.')
    installDesktop(async () => {
      throw failure
    })
    expect(await setKeepRunning(false)).toBe(false)
    expect(reportError).toHaveBeenCalledWith('Could not change the setting', failure, {
      facts: ['Keep running: false'],
    })
    expect(useAppSettings.getState().settings).toEqual(SETTINGS)
  })

  it('changes the websites through the main process', async () => {
    const withExample = { ...SETTINGS, websites: [...SETTINGS.websites, 'https://diagrams.example.com'] }
    const request = installDesktop(async (method) =>
      method === 'app.setShareWebsite' ? { ...withExample, shareWebsite: 'https://diagrams.example.com' } : withExample,
    )
    await addWebsite('https://diagrams.example.com')
    expect(request).toHaveBeenLastCalledWith('app.addWebsite', { website: 'https://diagrams.example.com' })
    expect(useAppSettings.getState().settings?.websites).toEqual(withExample.websites)
    await setShareWebsite('https://diagrams.example.com')
    expect(request).toHaveBeenLastCalledWith('app.setShareWebsite', { website: 'https://diagrams.example.com' })
    expect(useAppSettings.getState().settings?.shareWebsite).toBe('https://diagrams.example.com')
    await removeWebsite('https://draw.thias.dev')
    expect(request).toHaveBeenLastCalledWith('app.removeWebsite', { website: 'https://draw.thias.dev' })
  })

  it('asks the main process to quit', () => {
    const request = installDesktop(async () => null)
    quitApp()
    expect(request).toHaveBeenCalledWith('app.quit', null)
  })

  it('does nothing on the website', async () => {
    vi.stubGlobal('window', {})
    loadAppSettings()
    expect(await setKeepRunning(false)).toBe(false)
    expect(await addWebsite('https://diagrams.example.com')).toBe(false)
    quitApp()
    expect(useAppSettings.getState().settings).toBeNull()
  })
})
