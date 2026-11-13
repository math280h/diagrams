import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUTOSTART_FILE, BACKGROUND_ARG } from '@/desktop/constants'
import builderConfig from '../electron-builder.ts'

const electron = vi.hoisted(() => ({
  app: {
    isPackaged: true,
    getPath: vi.fn(() => '/home/user/.config'),
    getLoginItemSettings: vi.fn(),
    setLoginItemSettings: vi.fn(),
    isInApplicationsFolder: vi.fn(() => true),
  },
}))

vi.mock('electron', () => ({ app: electron.app }))

const {
  autostartEnabled,
  autostartEntry,
  autostartLoginItem,
  createLoginItem,
  execValue,
  startedAtLogin,
  WINDOWS_LOGIN_ITEM,
} = await import('./login-item')

const originalPlatform = process.platform
const folders: string[] = []

function tempFolder() {
  const folder = mkdtempSync(path.join(tmpdir(), 'login-item-'))
  folders.push(folder)
  return folder
}

function onPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: platform })
}

beforeEach(() => {
  vi.clearAllMocks()
  electron.app.isPackaged = true
})

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform })
  vi.unstubAllEnvs()
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

describe('execValue', () => {
  it('writes plain arguments as they are', () => {
    expect(execValue(['/opt/Diagrams/diagrams', BACKGROUND_ARG])).toBe('/opt/Diagrams/diagrams --background')
  })

  it('quotes and escapes arguments with spaces and reserved characters, as the Desktop Entry Specification asks', () => {
    expect(execValue(['/home/a b/Diagrams.AppImage'])).toBe('"/home/a b/Diagrams.AppImage"')
    expect(execValue(['/home/$user/50%/"x"'])).toBe('"/home/\\\\$user/50%%/\\\\"x\\\\""')
    expect(execValue(['C:\\Apps\\Diagrams.exe'])).toBe('"C:\\\\\\\\Apps\\\\\\\\Diagrams.exe"')
  })

  it('refuses a path with a line break', () => {
    expect(() => execValue(['/home/a\nb/diagrams'])).toThrow('line break')
  })
})

describe('autostartEntry', () => {
  it('names the program in TryExec, so that the system skips the entry after the app is removed', () => {
    const entry = autostartEntry(['/home/a b/Diagrams.AppImage', BACKGROUND_ARG])
    expect(entry).toContain('\nTryExec=/home/a b/Diagrams.AppImage\n')
    expect(entry).toContain('\nExec="/home/a b/Diagrams.AppImage" --background\n')
    expect(autostartEntry(['C:\\Apps\\Diagrams.exe'])).toContain('\nTryExec=C:\\\\Apps\\\\Diagrams.exe\n')
  })
})

describe('autostartEnabled', () => {
  it('is false for a hidden entry and for an entry that GNOME turned off, also with spaces around =', () => {
    const entry = autostartEntry(['/opt/Diagrams/diagrams', BACKGROUND_ARG])
    expect(autostartEnabled(entry)).toBe(true)
    expect(autostartEnabled(entry.replace('X-GNOME-Autostart-enabled=true', 'X-GNOME-Autostart-enabled=false'))).toBe(
      false,
    )
    expect(autostartEnabled(`${entry}Hidden=true\r\n`)).toBe(false)
    expect(autostartEnabled(`${entry}Hidden = true\n`)).toBe(false)
    expect(autostartEnabled(`${entry}X-GNOME-Autostart-enabled = false\n`)).toBe(false)
  })
})

describe('autostartLoginItem', () => {
  it('writes the entry, reads its state and removes it', () => {
    const folder = path.join(tempFolder(), 'autostart')
    const item = autostartLoginItem(folder, ['/opt/Diagrams/diagrams', BACKGROUND_ARG])
    expect(item.state()).toBe('off')
    item.set(true)
    expect(item.state()).toBe('on')
    expect(readFileSync(path.join(folder, AUTOSTART_FILE), 'utf8')).toContain(
      'Exec=/opt/Diagrams/diagrams --background\n',
    )
    item.set(false)
    expect(item.state()).toBe('off')
    item.set(false)
  })

  it('writes the new path into an entry that is on after the app moves, and leaves an entry that is off', () => {
    const folder = tempFolder()
    const file = path.join(folder, AUTOSTART_FILE)
    autostartLoginItem(folder, ['/apps/Diagrams-1.0.AppImage', BACKGROUND_ARG]).set(true)
    const moved = autostartLoginItem(folder, ['/apps/Diagrams-1.1.AppImage', BACKGROUND_ARG])
    moved.sync()
    expect(readFileSync(file, 'utf8')).toContain('Exec=/apps/Diagrams-1.1.AppImage --background\n')

    const turnedOff = `${readFileSync(file, 'utf8')}Hidden = true\n`
    writeFileSync(file, turnedOff)
    autostartLoginItem(folder, ['/apps/Diagrams-1.2.AppImage', BACKGROUND_ARG]).sync()
    expect(readFileSync(file, 'utf8')).toBe(turnedOff)
  })

  it('adds TryExec to an entry of an earlier version', () => {
    const folder = tempFolder()
    const file = path.join(folder, AUTOSTART_FILE)
    writeFileSync(file, '[Desktop Entry]\nType=Application\nExec=/opt/Diagrams/diagrams --background\n')
    autostartLoginItem(folder, ['/opt/Diagrams/diagrams', BACKGROUND_ARG]).sync()
    expect(readFileSync(file, 'utf8')).toContain('\nTryExec=/opt/Diagrams/diagrams\n')
  })
})

describe('createLoginItem', () => {
  it('has no login item in a build from source', () => {
    electron.app.isPackaged = false
    const item = createLoginItem()
    expect(item.state()).toBe('unsupported')
    expect(() => item.set(true)).toThrow('Only an installed app')
  })

  it('uses an autostart entry in the folder of DIAGRAMS_AUTOSTART_DIR on each system', () => {
    onPlatform('win32')
    electron.app.isPackaged = false
    const folder = tempFolder()
    vi.stubEnv('DIAGRAMS_AUTOSTART_DIR', folder)
    createLoginItem().set(true)
    expect(readFileSync(path.join(folder, AUTOSTART_FILE), 'utf8')).toContain(' --background\n')
    expect(electron.app.setLoginItemSettings).not.toHaveBeenCalled()
  })

  it('uses the Run key on Windows, with the app ID and the background argument', () => {
    onPlatform('win32')
    electron.app.getLoginItemSettings.mockReturnValue({ openAtLogin: false, executableWillLaunchAtLogin: true })
    const item = createLoginItem()
    expect(item.state()).toBe('on')
    expect(electron.app.getLoginItemSettings).toHaveBeenCalledWith({ name: WINDOWS_LOGIN_ITEM, args: [BACKGROUND_ARG] })
    item.set(false)
    expect(electron.app.setLoginItemSettings).toHaveBeenCalledWith({
      name: WINDOWS_LOGIN_ITEM,
      args: [BACKGROUND_ARG],
      openAtLogin: false,
    })
    electron.app.getLoginItemSettings.mockReturnValue({ openAtLogin: false, executableWillLaunchAtLogin: false })
    expect(item.state()).toBe('off')
  })

  it('names the Windows login item with the app ID, which the uninstaller removes', () => {
    expect(WINDOWS_LOGIN_ITEM).toBe(builderConfig.appId)
    expect(readFileSync(path.join(import.meta.dirname, '..', 'build', 'installer.nsh'), 'utf8')).toContain(
      `$INSTDIR\\\${APP_EXECUTABLE_FILENAME}" ${BACKGROUND_ARG}'`,
    )
  })

  it('reports on macOS when the user must allow the app in System Settings', () => {
    onPlatform('darwin')
    const item = createLoginItem()
    electron.app.getLoginItemSettings.mockReturnValue({ openAtLogin: false, status: 'requires-approval' })
    expect(item.state()).toBe('approval')
    electron.app.getLoginItemSettings.mockReturnValue({ openAtLogin: false, status: 'enabled' })
    expect(item.state()).toBe('on')
    electron.app.getLoginItemSettings.mockReturnValue({ openAtLogin: false, status: 'not-registered' })
    expect(item.state()).toBe('off')
  })

  it('counts a Mac app as installed only in the Applications folder, not on a disk image', () => {
    onPlatform('darwin')
    expect(createLoginItem().installed()).toBe(true)
    electron.app.isInApplicationsFolder.mockReturnValueOnce(false)
    expect(createLoginItem().installed()).toBe(false)
    onPlatform('win32')
    expect(createLoginItem().installed()).toBe(true)
    electron.app.isPackaged = false
    expect(createLoginItem().installed()).toBe(false)
  })

  it('uses an autostart entry in the configuration folder on Linux', () => {
    onPlatform('linux')
    const config = tempFolder()
    electron.app.getPath.mockReturnValue(config)
    createLoginItem().set(true)
    expect(electron.app.getPath).toHaveBeenCalledWith('appData')
    expect(readFileSync(path.join(config, 'autostart', AUTOSTART_FILE), 'utf8')).toContain('[Desktop Entry]')
  })
})

describe('startedAtLogin', () => {
  it('reads the background argument, and on macOS the launch at sign-in', () => {
    onPlatform('win32')
    expect(startedAtLogin(['Diagrams.exe', BACKGROUND_ARG])).toBe(true)
    expect(startedAtLogin(['Diagrams.exe'])).toBe(false)
    onPlatform('darwin')
    electron.app.getLoginItemSettings.mockReturnValue({ wasOpenedAtLogin: true })
    expect(startedAtLogin(['Diagrams'])).toBe(true)
  })
})
