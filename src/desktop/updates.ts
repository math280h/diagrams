import { toast } from 'sonner'
import { create } from 'zustand'
import { reportError } from '@/store/problem-store'
import { desktopApi, requestErrorMessage } from './bridge'
import { releaseLinks } from './build-config'
import type { UpdateInfo } from './contract'
import { openDesktopSettings } from './settings-dialog'

const UPDATE_TOAST_ID = 'update'

export const useUpdateInfo = create<{ info: UpdateInfo | null }>(() => ({ info: null }))

function showUpdate(info: UpdateInfo) {
  if (!info.version) return
  if (info.state === 'available') {
    const url = releaseLinks(info.repository).releaseTag(info.version)
    toast.info(`Version ${info.version} is available`, {
      id: UPDATE_TOAST_ID,
      description: 'Download it from GitHub and install it over this version.',
      duration: Infinity,
      action: { label: 'Download', onClick: () => window.open(url, '_blank', 'noreferrer') },
    })
  } else if (info.state === 'ready') {
    toast.info(`Version ${info.version} is ready`, {
      id: UPDATE_TOAST_ID,
      description: info.installsOnQuit
        ? 'Restart the app to use it, or it installs when you quit.'
        : 'Restart the app to install it.',
      duration: Infinity,
      action: { label: 'Restart', onClick: () => void desktopApi()?.request('update.install', null) },
    })
  }
}

/** Tells the user about a new version that is ready to install or to download. */
export function watchUpdates(): () => void {
  const desktop = desktopApi()
  if (!desktop) return () => undefined
  let shown: string | null = null
  const follow = (info: UpdateInfo) => {
    useUpdateInfo.setState({ info })
    if (info.state !== 'available' && info.state !== 'ready') return
    const key = `${info.state}:${info.version}`
    if (key === shown) return
    shown = key
    showUpdate(info)
  }
  void desktop.request('update.info', null).then(follow)
  return desktop.on('update.info', follow)
}

/** Checks for an update at the request of the user, and tells the user the result. */
export async function checkForUpdates() {
  const desktop = desktopApi()
  if (!desktop) return
  let info: UpdateInfo
  try {
    info = await desktop.request('update.check', null)
  } catch (error) {
    reportError('Could not check for updates', error)
    return
  }
  useUpdateInfo.setState({ info })
  switch (info.state) {
    case 'unsupported':
      toast.info('This build does not update itself', {
        description: 'Only the installed app gets updates. Pull the latest source and build it again.',
      })
      return
    case 'sign-in':
      toast.info('Sign in to GitHub to get updates', {
        id: UPDATE_TOAST_ID,
        description: `The updates of this build are in the private repository ${info.repository}.`,
        action: { label: 'Settings', onClick: openDesktopSettings },
      })
      return
    case 'available':
    case 'ready':
      showUpdate(info)
      return
    case 'downloading':
      toast.info(info.version ? `Version ${info.version} downloads now` : 'An update downloads now', {
        description: 'The app tells you when it is ready.',
      })
      return
    case 'failed':
      reportError('Could not check for updates', info.message ?? 'The update check failed.', {
        facts: [`Update state: ${info.state}`, `Version: ${info.currentVersion}`],
      })
      return
    case 'idle':
      toast.success(`You have the latest version, ${info.currentVersion}`)
      return
    case 'checking':
      return
  }
}

/**
 * Sets the repository of updates, or the repository of the build for `null`.
 *
 * @returns The reason when the main process refuses the repository, or `null`.
 */
export async function setUpdateRepository(repository: string | null): Promise<string | null> {
  const desktop = desktopApi()
  if (!desktop) return null
  try {
    useUpdateInfo.setState({ info: await desktop.request('update.setRepository', { repository }) })
    return null
  } catch (error) {
    return requestErrorMessage(error)
  }
}
