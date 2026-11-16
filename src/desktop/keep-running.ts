import type { AgentWindowMode, OpenAtLogin } from './contract'

export const KEEP_RUNNING_LABEL = 'Keep running when the window closes'
export const OPEN_AT_LOGIN_LABEL = 'Start when you sign in'
export const AGENT_WINDOW_LABEL = 'When an agent changes a diagram while the window is closed'

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

function trayQuit(platform: string): string {
  if (platform === 'darwin') return 'To quit, use the Diagrams icon in the menu bar.'
  if (platform === 'win32') return 'To quit, right-click the Diagrams icon in the notification area.'
  return 'To quit, use the Diagrams icon in the system tray.'
}

/**
 * Returns how the user quits the app while it runs without a window, for the text next to the setting.
 *
 * @param platform - A Node `process.platform` value.
 */
export function quitHint(platform: string): string {
  if (platform === 'linux') {
    return `${trayQuit(platform)} Some desktops show no tray: there, turn this off and close the window.`
  }
  return trayQuit(platform)
}

/**
 * Returns the notice that the app shows the first time it keeps running after the window closes.
 *
 * @param platform - A Node `process.platform` value.
 */
export function stillRunningNotice(platform: string) {
  return { title: 'Diagrams is still running', body: `Agents can still connect. ${trayQuit(platform)}` }
}
