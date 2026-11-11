import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadAppSettings, quitApp, setKeepRunning, useAppSettings } from './app-settings'
import type { DesktopApi } from './contract'

const reportError = vi.hoisted(() => vi.fn())
vi.mock('@/store/problem-store', () => ({ reportError }))

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
    const request = installDesktop(async () => ({ keepRunning: true }))
    loadAppSettings()
    await vi.waitFor(() => expect(useAppSettings.getState().settings).toEqual({ keepRunning: true }))
    expect(request).toHaveBeenCalledWith('app.settings', null)
  })

  it('changes the setting and keeps the answer of the main process', async () => {
    const request = installDesktop(async (_method, input) => input)
    await setKeepRunning(false)
    expect(request).toHaveBeenCalledWith('app.setKeepRunning', { keepRunning: false })
    expect(useAppSettings.getState().settings).toEqual({ keepRunning: false })
  })

  it('reports a change that the main process refuses, and keeps the old setting', async () => {
    useAppSettings.setState({ settings: { keepRunning: true } })
    const failure = new Error('The settings file is read-only.')
    installDesktop(async () => {
      throw failure
    })
    await setKeepRunning(false)
    expect(reportError).toHaveBeenCalledWith('Could not change the setting', failure, {
      facts: ['Keep running: false'],
    })
    expect(useAppSettings.getState().settings).toEqual({ keepRunning: true })
  })

  it('asks the main process to quit', () => {
    const request = installDesktop(async () => null)
    quitApp()
    expect(request).toHaveBeenCalledWith('app.quit', null)
  })

  it('does nothing on the website', async () => {
    vi.stubGlobal('window', {})
    loadAppSettings()
    await setKeepRunning(false)
    quitApp()
    expect(useAppSettings.getState().settings).toBeNull()
  })
})
