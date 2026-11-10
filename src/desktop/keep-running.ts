export const KEEP_RUNNING_LABEL = 'Keep running when the window closes'

const WINDOWS_QUIT = 'To quit, right-click the Diagrams icon in the notification area.'
const TRAY_QUIT = 'To quit, use the Diagrams icon in the system tray.'

/**
 * Returns how the user quits the app while it runs without a window, for the text next to the setting.
 *
 * @param platform - A Node `process.platform` value.
 */
export function quitHint(platform: string): string {
  if (platform === 'darwin') return 'To quit, press Command-Q.'
  if (platform === 'win32') return WINDOWS_QUIT
  return `${TRAY_QUIT} Some desktops show no tray: there, turn this off and close the window.`
}

/**
 * Returns the notice that the app shows the first time it keeps running after the window closes.
 *
 * @param platform - A Node `process.platform` value other than `darwin`.
 */
export function stillRunningNotice(platform: string) {
  return {
    title: 'Diagrams is still running',
    body: `Agents can still connect. ${platform === 'win32' ? WINDOWS_QUIT : TRAY_QUIT}`,
  }
}
