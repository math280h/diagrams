import type { UpdateInfo } from '@/desktop/contract'
import { errorMessage } from '@/lib/error-message'

export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60_000

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
  checkForUpdates(): Promise<unknown>
  quitAndInstall(): void
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

export interface Updates {
  info(): UpdateInfo
  /** Checks for an update unless one downloads or waits for a restart. Parallel calls share one check. */
  check(): Promise<UpdateInfo>
  install(): void
  stop(): void
}

/**
 * Keeps the app up to date as the policy says, with a check at each {@link UPDATE_CHECK_INTERVAL_MS}.
 *
 * @param updater - The updater, or `null` for a build that does not update itself.
 * @param emit - Receives each change of the update state.
 */
export function createUpdates(options: {
  updater: Updater | null
  policy: UpdatePolicy
  currentVersion: string
  emit: (info: UpdateInfo) => void
  intervalMs?: number
}): Updates {
  const { updater, policy, emit } = options
  let info: UpdateInfo = {
    state: 'unsupported',
    currentVersion: options.currentVersion,
    version: null,
    installsOnQuit: policy.kind === 'install' && policy.onQuit,
    message: null,
  }
  if (!updater || policy.kind === 'none') {
    return { info: () => info, check: async () => info, install: () => undefined, stop: () => undefined }
  }

  info = { ...info, state: 'idle' }
  const publish = (patch: Partial<UpdateInfo>) => {
    info = { ...info, ...patch }
    emit(info)
  }
  updater.autoDownload = policy.kind === 'install'
  updater.autoInstallOnAppQuit = info.installsOnQuit
  updater.on('checking-for-update', () => publish({ state: 'checking', message: null }))
  updater.on('update-not-available', () => publish({ state: 'idle', version: null }))
  updater.on('update-available', (release) =>
    publish({ state: policy.kind === 'install' ? 'downloading' : 'available', version: release.version }),
  )
  updater.on('update-downloaded', (release) => publish({ state: 'ready', version: release.version }))
  updater.on('error', (error) => {
    if (info.state !== 'ready') publish({ state: 'failed', message: errorMessage(error) })
  })

  let running: Promise<UpdateInfo> | null = null
  const check = () => {
    if (info.state === 'downloading' || info.state === 'ready') return Promise.resolve(info)
    running ??= updater
      .checkForUpdates()
      .then(
        () => info,
        (error: unknown) => {
          publish({ state: 'failed', message: errorMessage(error) })
          return info
        },
      )
      .finally(() => {
        running = null
      })
    return running
  }
  const timer = setInterval(() => void check(), options.intervalMs ?? UPDATE_CHECK_INTERVAL_MS)

  return {
    info: () => info,
    check,
    install: () => {
      if (info.state === 'ready') updater.quitAndInstall()
    },
    stop: () => clearInterval(timer),
  }
}
