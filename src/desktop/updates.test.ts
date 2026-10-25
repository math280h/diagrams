import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DesktopApi, MainEvents, UpdateInfo } from './contract'
import { checkForUpdates, watchUpdates } from './updates'

const toast = vi.hoisted(() => ({ info: vi.fn(), success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const BASE: UpdateInfo = {
  state: 'idle',
  currentVersion: '0.1.0',
  version: null,
  installsOnQuit: true,
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

  it('links to the release when the build may only notify', async () => {
    const { emit } = installDesktop(BASE)
    watchUpdates()
    await Promise.resolve()
    emit({ ...BASE, state: 'available', version: '0.2.0' })
    const [title, options] = toast.info.mock.calls[0]!
    expect(title).toBe('Version 0.2.0 is available')
    options.action.onClick()
    expect(window.open).toHaveBeenCalledWith(
      'https://github.com/math280h/diagrams/releases/tag/v0.2.0',
      '_blank',
      'noreferrer',
    )
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
    expect(toast.error).toHaveBeenCalledWith('Could not check for updates', {
      description: 'No published versions on GitHub',
    })
  })

  it('says that a restart installs a Linux package', async () => {
    installDesktop({ ...BASE, state: 'ready', version: '0.2.0', installsOnQuit: false })
    await checkForUpdates()
    expect(toast.info.mock.calls[0]![1].description).toBe('Restart the app to install it.')
  })
})
