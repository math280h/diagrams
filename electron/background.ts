import path from 'node:path'
import { Menu, nativeImage, Notification, Tray, type NativeImage } from 'electron'
import { stillRunningNotice } from '@/desktop/keep-running'
import { APP_NAME, iconPath, rendererFolder } from './paths'

// Windows draws tray icons at 16 px for a scale of 1. Linux trays use about 22 px.
const TRAY_ICON_PX = process.platform === 'win32' ? 16 : 22
const TRAY_SCALES = [1, 2]

function trayIcon(): NativeImage {
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
  /** Shows the tray icon while the setting is on, and removes it when the setting goes off. */
  follow(keepRunning: boolean): void
  /**
   * Tells the user that the app still runs without a window, and how to quit it.
   *
   * @returns False if the system cannot show the notice.
   */
  notify(): boolean
}

/**
 * Gives the app a tray icon on Windows and Linux while it can run without a window. Its menu opens the window or quits
 * the app.
 */
export function createBackground({ open, quit }: { open: () => void; quit: () => void }): Background {
  let tray: Tray | null = null
  return {
    follow(keepRunning) {
      if (!keepRunning) {
        tray?.destroy()
        tray = null
        return
      }
      if (tray) return
      tray = new Tray(trayIcon())
      tray.setToolTip(APP_NAME)
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: `Open ${APP_NAME}`, click: () => open() },
          { type: 'separator' },
          { label: `Quit ${APP_NAME}`, click: () => quit() },
        ]),
      )
      tray.on('click', () => open())
    },
    notify() {
      const notice = stillRunningNotice(process.platform)
      if (process.platform === 'win32' && tray) {
        tray.displayBalloon({ title: notice.title, content: notice.body, respectQuietTime: true })
        return true
      }
      if (!Notification.isSupported()) return false
      new Notification({ title: notice.title, body: notice.body }).show()
      return true
    },
  }
}
