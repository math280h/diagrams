import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UPDATE_CHECK_INTERVAL_MS } from '@/desktop/constants'
import type { UpdateInfo } from '@/desktop/contract'
import {
  createUpdates,
  nextAutomaticCheckMs,
  updatePolicy,
  type UpdateFeed,
  type UpdatePolicy,
  type Updater,
  type Updates,
} from './updates'

class FakeUpdater extends EventEmitter implements Updater {
  autoDownload = false
  autoInstallOnAppQuit = false
  setFeedURL = vi.fn()
  checkForUpdates = vi.fn(async (): Promise<unknown> => null)
  quitAndInstall = vi.fn()
}

const INSTALL: UpdatePolicy = { kind: 'install', onQuit: true }
const BUILD_REPOSITORY = 'math280h/diagrams'

function setup(
  policy: UpdatePolicy = INSTALL,
  updater: FakeUpdater | null = new FakeUpdater(),
  feed: () => Promise<UpdateFeed | 'sign-in'> = async () => ({ repository: BUILD_REPOSITORY, token: null }),
) {
  const emitted: UpdateInfo[] = []
  const steps: string[] = []
  const prepareQuit = vi.fn(async () => {
    steps.push('prepareQuit')
    return true
  })
  const cancelQuit = vi.fn(() => {
    steps.push('cancelQuit')
  })
  updater?.quitAndInstall.mockImplementation(() => {
    steps.push('quitAndInstall')
  })
  const updates = createUpdates({
    updater,
    policy,
    currentVersion: '0.1.0',
    buildRepository: BUILD_REPOSITORY,
    repository: BUILD_REPOSITORY,
    feed,
    emit: (info) => emitted.push(info),
    prepareQuit,
    cancelQuit,
    automatic: true,
  })
  return { updater, updates, emitted, steps, prepareQuit, cancelQuit }
}

function scheduled(automatic: boolean) {
  const updater = new FakeUpdater()
  const updates = createUpdates({
    updater,
    policy: INSTALL,
    currentVersion: '0.1.0',
    buildRepository: BUILD_REPOSITORY,
    repository: BUILD_REPOSITORY,
    feed: async () => ({ repository: BUILD_REPOSITORY, token: null }),
    emit: () => undefined,
    prepareQuit: async () => true,
    cancelQuit: () => undefined,
    automatic,
    intervalMs: 1000,
  })
  return { updater, updates }
}

async function downloadUpdate(updater: FakeUpdater, updates: Updates) {
  updater.checkForUpdates.mockImplementation(async () => {
    updater.emit('update-available', { version: '0.2.0' })
    updater.emit('update-downloaded', { version: '0.2.0' })
    return null
  })
  await updates.check()
  updater.checkForUpdates.mockClear()
}

describe('updatePolicy', () => {
  const build = {
    packaged: true,
    platform: 'win32' as const,
    packageType: null,
    appImage: false,
    macSigned: false,
    preview: false,
  }

  it('installs on quit on Windows, and never updates a build from source or a preview build', () => {
    expect(updatePolicy(build)).toEqual({ kind: 'install', onQuit: true })
    expect(updatePolicy({ ...build, packaged: false })).toEqual({ kind: 'none' })
    expect(updatePolicy({ ...build, preview: true })).toEqual({ kind: 'none' })
  })

  it('only tells the user about a new version on a macOS build without a signature', () => {
    expect(updatePolicy({ ...build, platform: 'darwin' })).toEqual({ kind: 'notify' })
    expect(updatePolicy({ ...build, platform: 'darwin', macSigned: true })).toEqual({ kind: 'install', onQuit: true })
  })

  it('installs a Linux package only on restart, an AppImage also on quit, and nothing else', () => {
    expect(updatePolicy({ ...build, platform: 'linux', packageType: 'deb' })).toEqual({
      kind: 'install',
      onQuit: false,
    })
    expect(updatePolicy({ ...build, platform: 'linux', appImage: true })).toEqual({ kind: 'install', onQuit: true })
    expect(updatePolicy({ ...build, platform: 'linux' })).toEqual({ kind: 'none' })
  })
})

describe('nextAutomaticCheckMs', () => {
  const schedule = { automatic: true, lastCheckMs: 10_000, nowMs: 10_000, intervalMs: 1000 }

  it('never checks while the automatic checks are off', () => {
    expect(nextAutomaticCheckMs({ ...schedule, automatic: false })).toBeNull()
    expect(nextAutomaticCheckMs({ ...schedule, automatic: false, lastCheckMs: null })).toBeNull()
  })

  it('checks at once before the first check and after a full interval', () => {
    expect(nextAutomaticCheckMs({ ...schedule, lastCheckMs: null })).toBe(0)
    expect(nextAutomaticCheckMs({ ...schedule, nowMs: 11_000 })).toBe(0)
    expect(nextAutomaticCheckMs({ ...schedule, nowMs: 50_000 })).toBe(0)
  })

  it('waits for the rest of the interval after the last check', () => {
    expect(nextAutomaticCheckMs(schedule)).toBe(1000)
    expect(nextAutomaticCheckMs({ ...schedule, nowMs: 10_400 })).toBe(600)
  })

  it('waits at most one interval when the clock goes back', () => {
    expect(nextAutomaticCheckMs({ ...schedule, nowMs: 2000 })).toBe(1000)
  })
})

describe('createUpdates', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports a build without an updater or a policy as unsupported', async () => {
    const withoutUpdater = setup(INSTALL, null)
    expect(await withoutUpdater.updates.check()).toMatchObject({ state: 'unsupported', currentVersion: '0.1.0' })
    const withoutPolicy = setup({ kind: 'none' })
    expect(await withoutPolicy.updates.check()).toMatchObject({ state: 'unsupported' })
    expect(withoutPolicy.updater!.checkForUpdates).not.toHaveBeenCalled()
    expect([...withoutUpdater.emitted, ...withoutPolicy.emitted]).toEqual([])
  })

  it('sets the updater to download and install as the policy says', () => {
    const install = setup()
    expect(install.updater!.autoDownload).toBe(true)
    expect(install.updater!.autoInstallOnAppQuit).toBe(true)
    const restart = setup({ kind: 'install', onQuit: false })
    expect(restart.updater!.autoInstallOnAppQuit).toBe(false)
    expect(restart.updates.info().installsOnQuit).toBe(false)
    const notify = setup({ kind: 'notify' })
    expect(notify.updater!.autoDownload).toBe(false)
    for (const { updates } of [install, restart, notify]) updates.stop()
  })

  it('reports the latest version when no update exists', async () => {
    const { updater, updates, emitted } = setup()
    updater!.checkForUpdates.mockImplementation(async () => {
      updater!.emit('checking-for-update')
      updater!.emit('update-not-available')
      return null
    })
    expect(await updates.check()).toMatchObject({ state: 'idle', version: null })
    expect(emitted.map((info) => info.state)).toEqual(['checking', 'idle'])
    updates.stop()
  })

  it('follows an update from download to restart, and checks no more while it waits', async () => {
    const { updater, updates } = setup()
    updater!.checkForUpdates.mockImplementation(async () => {
      updater!.emit('update-available', { version: '0.2.0' })
      return null
    })
    expect(await updates.check()).toMatchObject({ state: 'downloading', version: '0.2.0' })
    updater!.emit('update-downloaded', { version: '0.2.0' })
    expect(await updates.check()).toMatchObject({ state: 'ready', version: '0.2.0' })
    expect(updater!.checkForUpdates).toHaveBeenCalledTimes(1)
    updater!.emit('error', new Error('Network down'))
    expect(updates.info().state).toBe('ready')
    await updates.install()
    expect(updater!.quitAndInstall).toHaveBeenCalledOnce()
    updates.stop()
  })

  it('saves before the install, and runs one install for parallel calls', async () => {
    const { updater, updates, steps, cancelQuit } = setup()
    await downloadUpdate(updater!, updates)
    await Promise.all([updates.install(), updates.install()])
    expect(steps).toEqual(['prepareQuit', 'quitAndInstall'])
    await updates.install()
    expect(updater!.quitAndInstall).toHaveBeenCalledOnce()
    expect(cancelQuit).not.toHaveBeenCalled()
    updates.stop()
  })

  it('does not install while the user keeps the app open, and installs on a later call', async () => {
    const { updater, updates, steps, prepareQuit, cancelQuit } = setup()
    await downloadUpdate(updater!, updates)
    prepareQuit.mockImplementationOnce(async () => {
      steps.push('prepareQuit')
      return false
    })
    await updates.install()
    expect(steps).toEqual(['prepareQuit'])
    expect(updates.info().state).toBe('ready')
    expect(cancelQuit).not.toHaveBeenCalled()
    await updates.install()
    expect(steps).toEqual(['prepareQuit', 'prepareQuit', 'quitAndInstall'])
    updates.stop()
  })

  it('keeps the update ready and undoes the quit preparation when the install fails without a quit', async () => {
    const { updater, updates, steps } = setup({ kind: 'install', onQuit: false })
    await downloadUpdate(updater!, updates)
    updater!.quitAndInstall.mockImplementation(() => {
      steps.push('quitAndInstall')
      updater!.emit('error', new Error('Command pkexec exited with code 126'))
    })
    await updates.install()
    expect(steps).toEqual(['prepareQuit', 'quitAndInstall', 'cancelQuit'])
    expect(updates.info()).toMatchObject({
      state: 'install-failed',
      version: '0.2.0',
      message: 'Command pkexec exited with code 126',
    })

    expect(await updates.check()).toMatchObject({ state: 'install-failed' })
    expect(updater!.checkForUpdates).not.toHaveBeenCalled()
    updater!.emit('error', new Error('Network down'))
    expect(updates.info().message).toBe('Command pkexec exited with code 126')

    await updates.install()
    expect(steps).toEqual([
      'prepareQuit',
      'quitAndInstall',
      'cancelQuit',
      'prepareQuit',
      'quitAndInstall',
      'cancelQuit',
    ])
    updates.stop()
  })

  it('reports an install that throws, and an install error that comes later', async () => {
    const { updater, updates, cancelQuit } = setup()
    await downloadUpdate(updater!, updates)
    updater!.quitAndInstall.mockImplementationOnce(() => {
      throw new Error('No update filepath provided')
    })
    await updates.install()
    expect(cancelQuit).toHaveBeenCalledOnce()
    expect(updates.info()).toMatchObject({ state: 'install-failed', message: 'No update filepath provided' })

    await updates.install()
    expect(updates.info().state).toBe('install-failed')
    updater!.emit('error', new Error('Could not relaunch to install the update'))
    expect(cancelQuit).toHaveBeenCalledTimes(2)
    expect(updates.info()).toMatchObject({
      state: 'install-failed',
      message: 'Could not relaunch to install the update',
    })
    updates.stop()
  })

  it('reports a new version without a download when it may only notify', async () => {
    const { updater, updates } = setup({ kind: 'notify' })
    updater!.checkForUpdates.mockImplementation(async () => {
      updater!.emit('update-available', { version: '0.2.0' })
      return null
    })
    expect(await updates.check()).toMatchObject({ state: 'available', version: '0.2.0' })
    await updates.install()
    expect(updater!.quitAndInstall).not.toHaveBeenCalled()
    updates.stop()
  })

  it('reports a failed check with its reason, and shares one check between parallel calls', async () => {
    const { updater, updates } = setup()
    updater!.checkForUpdates.mockRejectedValue(new Error('No published versions on GitHub'))
    const [first, second] = await Promise.all([updates.check(), updates.check()])
    expect(first).toMatchObject({ state: 'failed', message: 'No published versions on GitHub' })
    expect(second).toBe(first)
    expect(updater!.checkForUpdates).toHaveBeenCalledOnce()
    updates.stop()
  })

  it('keeps the feed of the build file, and sets a feed only when the repository or the token changes', async () => {
    let feed: UpdateFeed = { repository: BUILD_REPOSITORY, token: null }
    const { updater, updates } = setup(INSTALL, new FakeUpdater(), async () => feed)
    await updates.check()
    expect(updater!.setFeedURL).not.toHaveBeenCalled()
    feed = { repository: 'acme/diagrams', token: 'token-1' }
    await updates.check()
    await updates.check()
    expect(updater!.setFeedURL).toHaveBeenCalledOnce()
    expect(updater!.setFeedURL).toHaveBeenLastCalledWith({
      provider: 'github',
      owner: 'acme',
      repo: 'diagrams',
      token: 'token-1',
    })
    feed = { repository: BUILD_REPOSITORY, token: null }
    await updates.check()
    expect(updater!.setFeedURL).toHaveBeenLastCalledWith({ provider: 'github', owner: 'math280h', repo: 'diagrams' })
    expect(updater!.checkForUpdates).toHaveBeenCalledTimes(4)
    updates.stop()
  })

  it('waits for a GitHub sign-in without a check, and reports a failed renewal', async () => {
    let feed: () => Promise<UpdateFeed | 'sign-in'> = async () => 'sign-in'
    const { updater, updates } = setup(INSTALL, new FakeUpdater(), () => feed())
    expect(await updates.check()).toMatchObject({ state: 'sign-in', version: null })
    expect(updater!.checkForUpdates).not.toHaveBeenCalled()
    feed = async () => {
      throw new Error('Could not reach GitHub to renew the sign-in.')
    }
    expect(await updates.check()).toMatchObject({
      state: 'failed',
      message: 'Could not reach GitHub to renew the sign-in.',
    })
    updates.stop()
  })

  it('shows another repository of updates, also in a build that does not update itself', () => {
    const { updates, emitted } = setup({ kind: 'none' })
    expect(updates.info().repository).toBe(BUILD_REPOSITORY)
    expect(updates.setRepository('acme/diagrams').repository).toBe('acme/diagrams')
    expect(emitted.at(-1)?.repository).toBe('acme/diagrams')
  })

  it('checks at the start and again after each interval, until it stops', async () => {
    vi.useFakeTimers()
    const { updater, updates } = scheduled(true)
    await vi.advanceTimersByTimeAsync(5000)
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    updates.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(updater.checkForUpdates).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(2500)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(3)
    updates.stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(3)
  })

  it('checks only at the request of the user while the automatic checks are off, and installs that update', async () => {
    vi.useFakeTimers()
    const { updater, updates } = scheduled(false)
    updates.start()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(updater.checkForUpdates).not.toHaveBeenCalled()

    await downloadUpdate(updater, updates)
    expect(updates.info()).toMatchObject({ state: 'ready', version: '0.2.0' })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
    await updates.install()
    expect(updater.quitAndInstall).toHaveBeenCalledOnce()
    updates.stop()
  })

  it('checks at once when the automatic checks come on without a check in the last interval', async () => {
    vi.useFakeTimers()
    const { updater, updates } = scheduled(false)
    updates.start()
    await vi.advanceTimersByTimeAsync(5000)
    updates.setAutomatic(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(updater.checkForUpdates).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1000)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2)

    updates.setAutomatic(false)
    await vi.advanceTimersByTimeAsync(5000)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2)
    updates.stop()
  })

  it('waits for the rest of the interval when the automatic checks come on after a recent check', async () => {
    vi.useFakeTimers()
    const { updater, updates } = scheduled(false)
    updates.start()
    await updates.check()
    await vi.advanceTimersByTimeAsync(400)
    updates.setAutomatic(true)
    await vi.advanceTimersByTimeAsync(599)
    expect(updater.checkForUpdates).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2)
    updates.stop()
  })

  it('starts the interval again after a check at the request of the user', async () => {
    vi.useFakeTimers()
    const { updater, updates } = scheduled(true)
    updates.start()
    await vi.advanceTimersByTimeAsync(600)
    await updates.check()
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(999)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(3)
    updates.stop()
  })

  it('has no automatic checks in a build that does not update itself', async () => {
    vi.useFakeTimers()
    const { updates, updater } = setup({ kind: 'none' })
    updates.start()
    updates.setAutomatic(true)
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS * 2)
    expect(updater!.checkForUpdates).not.toHaveBeenCalled()
    updates.stop()
  })
})
