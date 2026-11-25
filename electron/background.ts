import path from 'node:path'
import { app, Menu, nativeImage, Notification, Tray, type NativeImage } from 'electron'
import type { TrayHost } from '@/desktop/contract'
import { startedNotice, stillRunningNotice, trayIconShows } from '@/desktop/keep-running'
import { APP_NAME, iconPath, rendererFolder, trayTemplatePath } from './paths'
import { remakesTrayIcon } from './tray-host'

const MAC = process.platform === 'darwin'

// Windows draws tray icons at 16 px for a scale of 1. Linux trays use about 22 px.
const TRAY_ICON_PX = process.platform === 'win32' ? 16 : 22
const TRAY_SCALES = [1, 2]

function trayIcon(): NativeImage {
  if (MAC) return nativeImage.createFromPath(trayTemplatePath())
  const source = nativeImage.createFromPath(iconPath() ?? path.join(rendererFolder(), 'icons', 'icon-192.png'))
  const icon = nativeImage.createEmpty()
  for (const scaleFactor of TRAY_SCALES) {
    const sidePx = TRAY_ICON_PX * scaleFactor
    icon.addRepresentation({
      scaleFactor,
      buffer: source.resize({ width: sidePx, height: sidePx, quality: 'best' }).toPNG(),
    })
  }
  return icon
}

export interface Background {
  /**
   * Shows the tray icon or removes it.
   *
   * @param shown - True while the app can run without a window: it keeps running after the window closes, or it
   *   started at sign-in.
   */
  follow(shown: boolean): void
  /** Takes the last tray host that the system reports. A host that starts later gets a new tray icon. */
  setHost(host: TrayHost): void
  /** Removes the Dock icon on macOS while the app runs without a window. A window that shows brings it back. */
  hideDock(): void
  /**
   * Tells the user that the app still runs without a window, and how to quit it. Without a tray icon, a click on the
   * notice opens the window, and a new notice replaces the last one.
   *
   * @param moment - `closed` after the window closes, `started` after a start at sign-in.
   * @returns False if the system cannot show the notice.
   */
  notify(moment?: 'closed' | 'started'): boolean
}

/**
 * Gives the app a tray icon while it can run without a window: in the notification area on Windows, the system tray on
 * Linux and the menu bar on macOS. Its menu opens the window or quits the app.
 *
 * @param host - The tray host at the start.
 */
export function createBackground({
  open,
  quit,
  host: firstHost = 'present',
}: {
  open: () => void
  quit: () => void
  host?: TrayHost
}): Background {
  let tray: Tray | null = null
  let host = firstHost
  let notice: Notification | null = null

  const makeTray = () => {
    tray = new Tray(trayIcon())
    tray.setToolTip(APP_NAME)
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: `Open ${APP_NAME}`, click: () => open() },
        { type: 'separator' },
        { label: `Quit ${APP_NAME}`, click: () => quit() },
      ]),
    )
    // macOS opens the context menu on a click.
    if (!MAC) tray.on('click', () => open())
  }

  return {
    follow(shown) {
      if (!shown) {
        tray?.destroy()
        tray = null
        return
      }
      if (!tray) makeTray()
    },
    setHost(next) {
      const remake = remakesTrayIcon(host, next)
      host = next
      if (!remake || !tray) return
      tray.destroy()
      makeTray()
    },
    hideDock() {
      app.dock?.hide()
    },
    notify(moment = 'closed') {
      const text = moment === 'started' ? startedNotice() : stillRunningNotice(process.platform, host)
      if (process.platform === 'win32' && tray) {
        tray.displayBalloon({ title: text.title, content: text.body, respectQuietTime: true })
        return true
      }
      if (!Notification.isSupported()) return false
      const withTray = trayIconShows(process.platform, host)
      if (!withTray) notice?.close()
      notice = new Notification({ title: text.title, body: text.body })
      if (!withTray) notice.on('click', () => open())
      notice.show()
      return true
    },
  }
}
