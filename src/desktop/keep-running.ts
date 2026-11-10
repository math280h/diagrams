export const KEEP_RUNNING_LABEL = 'Keep running when the window closes'

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
