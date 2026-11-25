import type { AgentWindowMode, OpenAtLogin, TrayHost } from './contract'

export const KEEP_RUNNING_LABEL = 'Keep running when the window closes'
export const OPEN_AT_LOGIN_LABEL = 'Start when you sign in'
export const AGENT_WINDOW_LABEL = 'When an agent changes a diagram while the window is closed'
export const QUIT_LABEL = 'Quit Diagrams'
const SETTINGS_QUIT = 'To quit, use Quit in the app settings.'

export const AGENT_WINDOW_OPTIONS: readonly { value: AgentWindowMode; label: string }[] = [
  { value: 'show', label: 'Show without focus' },
  { value: 'focus', label: 'Show in front' },
  { value: 'hidden', label: 'Keep closed' },
]

/** Returns the text next to the setting that starts the app at sign-in. */
export function openAtLoginHint(state: OpenAtLogin): string {
  if (state === 'unsupported') return 'Only an installed app can start when you sign in.'
  if (state === 'approval') return 'To finish, allow Diagrams in System Settings, in General, Login Items.'
  return 'The app starts in the background, so agents can connect before you open it.'
}

/**
 * Tells whether the user can see the tray icon of the app for sure.
 *
 * @param platform - A Node `process.platform` value.
 */
export function trayIconShows(platform: string, trayHost: TrayHost): boolean {
  return platform !== 'linux' || trayHost === 'present'
}

function trayQuit(platform: string): string {
  if (platform === 'darwin') return 'To quit, use the Diagrams icon in the menu bar.'
  if (platform === 'win32') return 'To quit, right-click the Diagrams icon in the notification area.'
  return 'To quit, use the Diagrams icon in the system tray.'
}

/**
 * Returns how the user quits the app while it runs without a window, and how the window comes back without a tray
 * icon.
 *
 * @param platform - A Node `process.platform` value.
 */
export function quitHint(platform: string, trayHost: TrayHost): string {
  if (trayIconShows(platform, trayHost)) return trayQuit(platform)
  if (trayHost === 'missing') return 'This desktop shows no tray icon. To get the window back, start Diagrams again.'
  return `${trayQuit(platform)} If this desktop shows no tray, start Diagrams again to get the window back.`
}

/** Returns the text next to the setting that keeps the app running after the window closes. */
export function keepRunningHint(platform: string, trayHost: TrayHost): string {
  return `Agents can connect while the window is closed. ${quitHint(platform, trayHost)}`
}

/** Returns the text next to the button that quits the app, or `null` when the app shows no such button. */
export function quitButtonHint(platform: string, trayHost: TrayHost): string | null {
  if (trayIconShows(platform, trayHost)) return null
  if (trayHost === 'missing') return 'Stops the app and its agent server.'
  return 'If this desktop shows no tray icon, quit here to stop the app and its agent server.'
}

/**
 * Returns the notice that tells the user that the app still runs after the window closes.
 *
 * @param platform - A Node `process.platform` value.
 */
export function stillRunningNotice(platform: string, trayHost: TrayHost) {
  const title = 'Diagrams is still running'
  if (trayIconShows(platform, trayHost)) return { title, body: `Agents can still connect. ${trayQuit(platform)}` }
  return {
    title,
    body: `Agents can still connect. To open the window, click this notice or start Diagrams again. ${SETTINGS_QUIT}`,
  }
}

/** Returns the notice that the app shows when it starts at sign-in and the tray icon can be missing. */
export function startedNotice() {
  return {
    title: 'Diagrams is running',
    body: `Agents can connect. To open the window, click this notice or start Diagrams. ${SETTINGS_QUIT}`,
  }
}

/**
 * Tells whether the app shows {@link startedNotice} when it starts at sign-in.
 *
 * @param platform - A Node `process.platform` value.
 */
export function showsStartedNotice(platform: string, trayHost: TrayHost): boolean {
  return !trayIconShows(platform, trayHost)
}

/**
 * Tells whether the app shows {@link stillRunningNotice} after the window closes and the app keeps running. With a
 * tray icon, the notice shows one time. Without a tray icon, it shows at each close.
 *
 * @param noticeShown - True after the notice showed one time with a tray icon.
 */
export function showsStillRunningNotice(platform: string, trayHost: TrayHost, noticeShown: boolean): boolean {
  return !noticeShown || !trayIconShows(platform, trayHost)
}
