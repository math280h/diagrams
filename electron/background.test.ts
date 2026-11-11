import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => {
  const tray = {
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    on: vi.fn(),
    destroy: vi.fn(),
    displayBalloon: vi.fn(),
  }
  const notification = { show: vi.fn() }
  const image = { resize: vi.fn(() => ({ toPNG: () => new Uint8Array() })), addRepresentation: vi.fn() }
  return {
    tray,
    notification,
    image,
    appListeners: new Map<string, (...args: unknown[]) => void>(),
    dock: { hide: vi.fn(), show: vi.fn(async () => undefined) },
    Tray: vi.fn(function Tray() {
      return tray
    }),
    Notification: Object.assign(
      vi.fn(function Notification() {
        return notification
      }),
      { isSupported: vi.fn(() => true) },
    ),
  }
})

vi.mock('electron', () => ({
  app: {
    on: (event: string, listener: (...args: unknown[]) => void) => electron.appListeners.set(event, listener),
    dock: electron.dock,
  },
  Menu: { buildFromTemplate: (template: unknown) => template },
  nativeImage: { createFromPath: () => electron.image, createEmpty: () => electron.image },
  Notification: electron.Notification,
  Tray: electron.Tray,
}))

vi.mock('./paths', () => ({
  APP_NAME: 'Diagrams',
  iconPath: () => null,
  rendererFolder: () => '/app/dist',
  trayTemplatePath: () => '/app/build/trayTemplate.png',
}))

type MenuItem = { label?: string; type?: string; click?: () => void }

const originalPlatform = process.platform

async function loadBackground(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: platform })
  vi.resetModules()
  return import('./background')
}

beforeEach(() => {
  vi.clearAllMocks()
  electron.appListeners.clear()
  electron.Notification.isSupported.mockReturnValue(true)
})

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform })
})

describe('createBackground', () => {
  it('shows one tray icon with Open and Quit while the app keeps running, and removes it when the setting goes off', async () => {
    const { createBackground } = await loadBackground('win32')
    const open = vi.fn()
    const quit = vi.fn()
    const background = createBackground({ open, quit })
    background.follow(true)
    background.follow(true)
    expect(electron.Tray).toHaveBeenCalledTimes(1)
    expect(electron.tray.setToolTip).toHaveBeenCalledWith('Diagrams')

    const menu = electron.tray.setContextMenu.mock.calls[0]![0] as MenuItem[]
    expect(menu.map((item) => item.label ?? item.type)).toEqual(['Open Diagrams', 'separator', 'Quit Diagrams'])
    menu[0]!.click!()
    menu[2]!.click!()
    expect(open).toHaveBeenCalledTimes(1)
    expect(quit).toHaveBeenCalledTimes(1)
    const [event, onClick] = electron.tray.on.mock.calls[0] as [string, () => void]
    expect(event).toBe('click')
    onClick()
    expect(open).toHaveBeenCalledTimes(2)

    background.follow(false)
    expect(electron.tray.destroy).toHaveBeenCalledTimes(1)
    background.follow(false)
    expect(electron.tray.destroy).toHaveBeenCalledTimes(1)
  })

  it('tells the user on Windows with a balloon of the tray icon', async () => {
    const { createBackground } = await loadBackground('win32')
    const background = createBackground({ open: vi.fn(), quit: vi.fn() })
    background.follow(true)
    expect(background.notify()).toBe(true)
    expect(electron.tray.displayBalloon).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Diagrams is still running', respectQuietTime: true }),
    )
    expect(electron.Notification).not.toHaveBeenCalled()
  })

  it('tells the user on Linux with a system notification, if the system has notifications', async () => {
    const { createBackground } = await loadBackground('linux')
    const background = createBackground({ open: vi.fn(), quit: vi.fn() })
    background.follow(true)
    expect(background.notify()).toBe(true)
    expect(electron.notification.show).toHaveBeenCalledTimes(1)
    electron.Notification.isSupported.mockReturnValue(false)
    expect(background.notify()).toBe(false)
  })

  it('uses the menu bar on macOS: a template icon, the menu on a click, and the Dock only with a window', async () => {
    const { createBackground } = await loadBackground('darwin')
    const background = createBackground({ open: vi.fn(), quit: vi.fn() })
    background.follow(true)
    expect(electron.image.resize).not.toHaveBeenCalled()
    expect(electron.tray.on).not.toHaveBeenCalled()

    background.hideDock()
    expect(electron.dock.hide).toHaveBeenCalledTimes(1)
    const created = electron.appListeners.get('browser-window-created')!
    created({}, { webContents: { isOffscreen: () => true } })
    expect(electron.dock.show).not.toHaveBeenCalled()
    created({}, { webContents: { isOffscreen: () => false } })
    expect(electron.dock.show).toHaveBeenCalledTimes(1)
  })
})
