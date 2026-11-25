import { UPDATE_CHECK_INTERVAL_MS } from '@/desktop/constants'
import type { UpdateInfo } from '@/desktop/contract'
import { errorMessage } from '@/lib/error-message'

interface Release {
  version: string
}

/** The part of the electron-updater `autoUpdater` that the app uses. */
export interface Updater {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  on(event: 'checking-for-update' | 'update-not-available', listener: () => void): unknown
  on(event: 'update-available' | 'update-downloaded', listener: (release: Release) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
  /** Replaces the feed of `app-update.yml`. With a token, electron-updater reads a private repository. */
  setFeedURL(options: { provider: 'github'; owner: string; repo: string; token?: string }): void
  checkForUpdates(): Promise<unknown>
  quitAndInstall(): void
}

/** Where the app looks for updates: a GitHub repository as `owner/name`, and a token for a private one. */
export interface UpdateFeed {
  repository: string
  token: string | null
}

/**
 * How a build gets updates. `notify` tells the user about a new version but does not download it. `install`
 * downloads it, and `onQuit` installs it when the app quits.
 */
export type UpdatePolicy = { kind: 'none' } | { kind: 'notify' } | { kind: 'install'; onQuit: boolean }

/**
 * Returns the update policy of a build.
 *
 * @param build.packageType - The content of `resources/package-type`, which electron-builder writes for deb, rpm and
 *   pacman packages, or `null`.
 * @param build.appImage - True if the app runs from an AppImage.
 * @param build.macSigned - True if the macOS build has a Developer ID signature. macOS does not install updates for
 *   other builds.
 * @param build.preview - True for a build of `main` from the preview pre-release, which a newer build replaces by hand.
 */
export function updatePolicy(build: {
  packaged: boolean
  platform: NodeJS.Platform
  packageType: string | null
  appImage: boolean
  macSigned: boolean
  preview: boolean
}): UpdatePolicy {
  if (!build.packaged || build.preview) return { kind: 'none' }
  if (build.platform === 'darwin') return build.macSigned ? { kind: 'install', onQuit: true } : { kind: 'notify' }
  if (build.platform === 'linux') {
    if (build.packageType) return { kind: 'install', onQuit: false }
    return build.appImage ? { kind: 'install', onQuit: true } : { kind: 'none' }
  }
  return { kind: 'install', onQuit: true }
}

/**
 * Returns the time until the next automatic check, or `null` while the automatic checks are off.
 *
 * @param schedule.lastCheckMs - The time of the last check, or `null` before the first check. A check at the request
 *   of the user also counts.
 * @param schedule.nowMs - The time now, on the same clock as `lastCheckMs`.
 * @returns 0 when a check is due, else a time of at most `intervalMs`.
 */
export function nextAutomaticCheckMs(schedule: {
  automatic: boolean
  lastCheckMs: number | null
  nowMs: number
  intervalMs: number
}): number | null {
  if (!schedule.automatic) return null
  if (schedule.lastCheckMs === null) return 0
  const remainingMs = schedule.intervalMs - (schedule.nowMs - schedule.lastCheckMs)
  return Math.min(schedule.intervalMs, Math.max(0, remainingMs))
}

export interface Updates {
  info(): UpdateInfo
  /**
   * Checks for an update unless one downloads or waits for a restart. Parallel calls share one check. The call works
   * also while the automatic checks are off, and the next automatic check comes one interval after it.
   */
  check(): Promise<UpdateInfo>
  /** Starts the automatic checks. When they are on, the first check starts at once. */
  start(): void
  /**
   * Turns the automatic checks on or off. When they come on, a check starts at once if no check started in the last
   * interval.
   */
  setAutomatic(automatic: boolean): void
  /** Shows another repository of updates. The next check reads the feed again. */
  setRepository(repository: string): UpdateInfo
  /**
   * Prepares the quit and installs the downloaded update, which quits the app. When the install fails, the call cancels
   * the quit preparation and sets the state to `install-failed`. The call does nothing while an install runs.
   */
  install(): Promise<void>
  stop(): void
}

function feedKey({ repository, token }: UpdateFeed) {
  return `${repository} ${token ?? ''}`
}

/**
 * Keeps the app up to date as the policy says. While the automatic checks are on, a check starts at each
 * {@link UPDATE_CHECK_INTERVAL_MS}, see {@link nextAutomaticCheckMs}.
 *
 * @param updater - The updater, or `null` for a build that does not update itself.
 * @param automatic - True if the app checks on its own, after {@link Updates.start}.
 * @param buildRepository - The repository in the `app-update.yml` of the build.
 * @param feed - Returns the feed for the next check, or `sign-in` while a private repository needs a GitHub sign-in.
 *   The updater keeps the feed of `app-update.yml` until it differs.
 * @param emit - Receives each change of the update state.
 * @param prepareQuit - Runs before the install. It saves the open work, so that the windows can close at once. False
 *   means that the user keeps the app open, and the install does not start.
 * @param cancelQuit - Cancels `prepareQuit` when the install fails and the app does not quit.
 */
export function createUpdates(options: {
  updater: Updater | null
  policy: UpdatePolicy
  currentVersion: string
  buildRepository: string
  repository: string
  feed: () => Promise<UpdateFeed | 'sign-in'>
  emit: (info: UpdateInfo) => void
  prepareQuit: () => Promise<boolean>
  cancelQuit: () => void
  automatic: boolean
  intervalMs?: number
  now?: () => number
}): Updates {
  const { updater, policy, emit } = options
  let info: UpdateInfo = {
    state: 'unsupported',
    currentVersion: options.currentVersion,
    version: null,
    installsOnQuit: policy.kind === 'install' && policy.onQuit,
    repository: options.repository,
    message: null,
  }
  const publish = (patch: Partial<UpdateInfo>) => {
    info = { ...info, ...patch }
    emit(info)
    return info
  }
  const setRepository = (repository: string) => publish({ repository })
  if (!updater || policy.kind === 'none') {
    return {
      info: () => info,
      check: async () => info,
      start: () => undefined,
      setAutomatic: () => undefined,
      setRepository,
      install: async () => undefined,
      stop: () => undefined,
    }
  }

  info = { ...info, state: 'idle' }
  let appliedFeed = feedKey({ repository: options.buildRepository, token: null })
  const apply = (feed: UpdateFeed) => {
    const key = feedKey(feed)
    if (key === appliedFeed) return
    const [owner = '', repo = ''] = feed.repository.split('/')
    updater.setFeedURL({ provider: 'github', owner, repo, ...(feed.token !== null && { token: feed.token }) })
    appliedFeed = key
  }
  updater.autoDownload = policy.kind === 'install'
  updater.autoInstallOnAppQuit = info.installsOnQuit
  updater.on('checking-for-update', () => publish({ state: 'checking', message: null }))
  updater.on('update-not-available', () => publish({ state: 'idle', version: null }))
  updater.on('update-available', (release) =>
    publish({ state: policy.kind === 'install' ? 'downloading' : 'available', version: release.version }),
  )
  updater.on('update-downloaded', (release) => publish({ state: 'ready', version: release.version }))
  const downloaded = () => info.state === 'ready' || info.state === 'install-failed'
  let installStep: 'none' | 'preparing' | 'started' = 'none'
  const failInstall = (error: unknown) => {
    installStep = 'none'
    options.cancelQuit()
    publish({ state: 'install-failed', message: errorMessage(error) })
  }
  updater.on('error', (error) => {
    if (installStep === 'started') failInstall(error)
    else if (!downloaded()) publish({ state: 'failed', message: errorMessage(error) })
  })

  const checkFeed = async () => {
    const feed = await options.feed()
    if (feed === 'sign-in') return publish({ state: 'sign-in', version: null, message: null })
    apply(feed)
    await updater.checkForUpdates()
    return info
  }
  const now = options.now ?? Date.now
  const intervalMs = options.intervalMs ?? UPDATE_CHECK_INTERVAL_MS
  let automatic = options.automatic
  let started = false
  let lastCheckMs: number | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let running: Promise<UpdateInfo> | null = null
  const schedule = () => {
    clearTimeout(timer)
    timer = undefined
    if (!started) return
    const delayMs = nextAutomaticCheckMs({ automatic, lastCheckMs, nowMs: now(), intervalMs })
    if (delayMs !== null) timer = setTimeout(() => void check(), delayMs)
  }
  const check = () => {
    if (!running) {
      lastCheckMs = now()
      schedule()
    }
    if (info.state === 'downloading' || downloaded()) return Promise.resolve(info)
    running ??= checkFeed()
      .catch((error: unknown) => publish({ state: 'failed', message: errorMessage(error) }))
      .finally(() => {
        running = null
      })
    return running
  }

  return {
    info: () => info,
    check,
    start: () => {
      started = true
      schedule()
    },
    setAutomatic: (next) => {
      automatic = next
      schedule()
    },
    setRepository,
    install: async () => {
      if (installStep !== 'none' || !downloaded()) return
      installStep = 'preparing'
      try {
        if (!(await options.prepareQuit())) {
          installStep = 'none'
          return
        }
        installStep = 'started'
        updater.quitAndInstall()
      } catch (error) {
        failInstall(error)
      }
    },
    stop: () => {
      started = false
      schedule()
    },
  }
}
