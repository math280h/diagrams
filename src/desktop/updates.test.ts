import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DesktopApi, MainEvents, UpdateInfo } from './contract'
import { useDesktopSettingsDialog } from './settings-dialog'
import { checkForUpdates, setUpdateRepository, useUpdateInfo, watchUpdates } from './updates'

const toast = vi.hoisted(() => ({ info: vi.fn(), success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const BASE: UpdateInfo = {
  state: 'idle',
  currentVersion: '0.1.0',
  version: null,
  installsOnQuit: true,
  repository: 'acme/diagrams',
  message: null,
}

function installDesktop(info: UpdateInfo) {
  let listener: ((payload: MainEvents['update.info']) => void) | null = null
  const request = vi.fn(async (method: string) => (method === 'update.install' ? null : info))
  const desktop = {
    platform: 'win32',
    request,
    on: (_name: string, next: (payload: MainEvents['update.info']) => void) => {
      listener = next
      return () => undefined
    },
    serve: () => () => undefined,
    ready: () => undefined,
  } as unknown as DesktopApi
  vi.stubGlobal('window', { desktop, open: vi.fn() })
  return { request, emit: (next: UpdateInfo) => listener?.(next) }
}

describe('desktop updates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('offers a restart once for each downloaded version', async () => {
    const { request, emit } = installDesktop(BASE)
    watchUpdates()
    await Promise.resolve()
    emit({ ...BASE, state: 'ready', version: '0.2.0' })
    emit({ ...BASE, state: 'ready', version: '0.2.0' })
    expect(toast.info).toHaveBeenCalledOnce()
    const [title, options] = toast.info.mock.calls[0]!
    expect(title).toBe('Version 0.2.0 is ready')
    expect(options.description).toBe('Restart the app to use it, or it installs when you quit.')
    options.action.onClick()
    expect(request).toHaveBeenCalledWith('update.install', null)
  })

  it('links to the release in the repository of the updates when the build may only notify', async () => {
    const { emit } = installDesktop(BASE)
    watchUpdates()
    await Promise.resolve()
    emit({ ...BASE, state: 'available', version: '0.2.0' })
    const [title, options] = toast.info.mock.calls[0]!
    expect(title).toBe('Version 0.2.0 is available')
    options.action.onClick()
    expect(window.open).toHaveBeenCalledWith(
      'https://github.com/acme/diagrams/releases/tag/v0.2.0',
      '_blank',
      'noreferrer',
    )
    expect(useUpdateInfo.getState().info).toEqual({ ...BASE, state: 'available', version: '0.2.0' })
  })

  it('asks for a GitHub sign-in when the updates are in a private repository', async () => {
    installDesktop({ ...BASE, state: 'sign-in' })
    await checkForUpdates()
    const [title, options] = toast.info.mock.calls[0]!
    expect(title).toBe('Sign in to GitHub to get updates')
    expect(options.description).toBe('The updates of this build are in the private repository acme/diagrams.')
    options.action.onClick()
    expect(useDesktopSettingsDialog.getState().open).toBe(true)
  })

  it('sets the repository of updates, and returns the reason of the main process when it refuses', async () => {
    const { request } = installDesktop({ ...BASE, repository: 'acme/fork' })
    expect(await setUpdateRepository('acme/fork')).toBeNull()
    expect(request).toHaveBeenCalledWith('update.setRepository', { repository: 'acme/fork' })
    expect(useUpdateInfo.getState().info?.repository).toBe('acme/fork')

    request.mockRejectedValueOnce(
      new Error("Error invoking remote method 'dg:request': Error: GitHub has no release in acme/none."),
    )
    expect(await setUpdateRepository('acme/none')).toBe('GitHub has no release in acme/none.')
  })

  it('tells the user the result of a check', async () => {
    installDesktop(BASE)
    await checkForUpdates()
    expect(toast.success).toHaveBeenCalledWith('You have the latest version, 0.1.0')

    installDesktop({ ...BASE, state: 'unsupported' })
    await checkForUpdates()
    expect(toast.info).toHaveBeenCalledWith('This build does not update itself', expect.anything())

    installDesktop({ ...BASE, state: 'failed', message: 'No published versions on GitHub' })
    await checkForUpdates()
    expect(toast.error).toHaveBeenCalledWith(
      'Could not check for updates',
      expect.objectContaining({
        description: 'No published versions on GitHub',
        action: expect.objectContaining({ label: 'More details' }),
      }),
    )
  })

  it('says that a restart installs a Linux package', async () => {
    installDesktop({ ...BASE, state: 'ready', version: '0.2.0', installsOnQuit: false })
    await checkForUpdates()
    expect(toast.info.mock.calls[0]![1].description).toBe('Restart the app to install it.')
  })
})
