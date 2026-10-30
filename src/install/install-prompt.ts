import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { isDesktop } from '@/desktop/bridge'
import { browserDeviceKind } from '@/lib/device'

/** The event of Chromium browsers that offers to install the website. The DOM library of TypeScript does not have it. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface InstallState {
  /** The install prompt that the browser offers, or `null` until it offers one. */
  prompt: BeforeInstallPromptEvent | null
  installed: boolean
}

export const useInstall = create<InstallState>(() => ({ prompt: null, installed: false }))

interface InstallIntro {
  /** If true, the user closed the install offer on the library. */
  hidden: boolean
}

const useInstallIntro = create<InstallIntro>()(
  persist((): InstallIntro => ({ hidden: false }), {
    name: 'dg:install-intro',
    storage: createJSONStorage(() => localStorage),
  }),
)

/** Returns true when the page runs as an installed app, in its own window. */
export function runsAsInstalledApp(): boolean {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** Keeps the install prompt of the browser for the install offer on tablets. Call it once when the website starts. */
export function watchInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (event) => {
    if (browserDeviceKind() !== 'tablet') return
    // Without preventDefault, Chrome on Android shows its own install bar next to the offer.
    event.preventDefault()
    useInstall.setState({ prompt: event as BeforeInstallPromptEvent })
  })
  window.addEventListener('appinstalled', () => useInstall.setState({ prompt: null, installed: true }))
}

/** Opens the install prompt of the browser. Call it inside a click handler. */
export async function promptInstall() {
  const { prompt } = useInstall.getState()
  if (!prompt) return
  await prompt.prompt()
  const { outcome } = await prompt.userChoice
  useInstall.setState({ prompt: null, installed: outcome === 'accepted' })
}

export function hideInstallIntro() {
  useInstallIntro.setState({ hidden: true })
}

/**
 * Returns true while the library offers to install the website. It does so on tablets, which cannot run the desktop
 * app, until the user installs the website or closes the offer.
 */
export function useInstallIntroVisible() {
  const hidden = useInstallIntro((state) => state.hidden)
  const installed = useInstall((state) => state.installed)
  return !hidden && !installed && !isDesktop() && browserDeviceKind() === 'tablet' && !runsAsInstalledApp()
}
