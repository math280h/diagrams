import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { AUTOSTART_FILE, BACKGROUND_ARG } from '@/desktop/constants'
import type { OpenAtLogin } from '@/desktop/contract'
import { APP_NAME } from './paths'

/** The name of the registry value of the Windows login item. It is the app ID, as in `build/installer.nsh`. */
export const WINDOWS_LOGIN_ITEM = 'dev.thias.diagrams'

export interface LoginItem {
  state(): OpenAtLogin
  /**
   * Adds the app to the programs that start at sign-in, or removes it.
   *
   * @throws Error If the build cannot start at sign-in, or if the system refuses the change.
   */
  set(on: boolean): void
  /** Writes the current command line into an entry that is on, if the app moved. */
  sync(): void
  /** Tells whether the app runs from a place where it stays, so that a new item can point at it. */
  installed(): boolean
}

const UNSUPPORTED: LoginItem = {
  state: () => 'unsupported',
  set() {
    throw new Error('Only an installed app can start when you sign in.')
  },
  sync: () => undefined,
  installed: () => false,
}

const PLAIN_EXEC_ARG = /^[\w/.,:@=+-]+$/

function assertOneLine(value: string) {
  if (/[\n\r]/.test(value)) throw new Error('A path of the app has a line break, so the system cannot start it.')
}

// The Desktop Entry Specification puts an Exec argument with other characters in double quotes, with a backslash
// before ", `, $ and \. The string value then needs a second backslash before each backslash, and %% for a literal %.
function execArg(arg: string): string {
  assertOneLine(arg)
  if (PLAIN_EXEC_ARG.test(arg)) return arg
  const quoted = `"${arg.replace(/["`$\\]/g, '\\$&')}"`
  return quoted.replaceAll('\\', '\\\\').replaceAll('%', '%%')
}

/** Returns the Exec value of an autostart entry that runs the command. */
export function execValue(command: readonly string[]): string {
  return command.map(execArg).join(' ')
}

/** Returns the text of an XDG autostart entry that runs the command at sign-in, while its program exists. */
export function autostartEntry(command: readonly string[]): string {
  const program = command[0] ?? ''
  assertOneLine(program)
  return [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${APP_NAME}`,
    `TryExec=${program.replaceAll('\\', '\\\\')}`,
    `Exec=${execValue(command)}`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n')
}

// The Desktop Entry Specification ignores spaces before and after the = of a key.
function entryValues(text: string): Map<string, string> {
  const values = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const separator = line.indexOf('=')
    if (separator > 0) values.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim())
  }
  return values
}

/** Tells whether the system starts an autostart entry. It skips a hidden entry and an entry that GNOME turned off. */
export function autostartEnabled(text: string): boolean {
  const values = entryValues(text)
  return values.get('Hidden') !== 'true' && values.get('X-GNOME-Autostart-enabled') !== 'false'
}

/** Returns a login item that is an XDG autostart entry in the folder. */
export function autostartLoginItem(folder: string, command: readonly string[]): LoginItem {
  const file = path.join(folder, AUTOSTART_FILE)
  const read = () => {
    try {
      return readFileSync(file, 'utf8')
    } catch {
      return null
    }
  }
  const write = () => {
    mkdirSync(folder, { recursive: true })
    writeFileSync(file, autostartEntry(command))
  }
  return {
    state() {
      const text = read()
      return text !== null && autostartEnabled(text) ? 'on' : 'off'
    },
    set(on) {
      if (on) write()
      else rmSync(file, { force: true })
    },
    sync() {
      const text = read()
      if (text === null || !autostartEnabled(text)) return
      try {
        if (text !== autostartEntry(command)) write()
      } catch {
        return
      }
    },
    installed: () => true,
  }
}

function windowsLoginItem(): LoginItem {
  const options = { name: WINDOWS_LOGIN_ITEM, args: [BACKGROUND_ARG] }
  return {
    // Electron 45 reports `openAtLogin` as false for an item with arguments. `executableWillLaunchAtLogin` is false
    // too when the user turns the item off in Task Manager.
    state: () => (app.getLoginItemSettings(options).executableWillLaunchAtLogin ? 'on' : 'off'),
    set: (on) => app.setLoginItemSettings({ ...options, openAtLogin: on }),
    sync: () => undefined,
    installed: () => true,
  }
}

function macLoginItem(): LoginItem {
  return {
    state() {
      const { openAtLogin, status } = app.getLoginItemSettings()
      if (status === 'requires-approval') return 'approval'
      return openAtLogin || status === 'enabled' ? 'on' : 'off'
    },
    set: (on) => app.setLoginItemSettings({ openAtLogin: on }),
    sync: () => undefined,
    installed: () => app.isInApplicationsFolder(),
  }
}

function loginCommand(): string[] {
  const entry = process.defaultApp ? process.argv[1] : undefined
  return [process.env.APPIMAGE ?? process.execPath, ...(entry ? [path.resolve(entry)] : []), BACKGROUND_ARG]
}

/**
 * Returns the login item of the app on this system. In a build from source, its state is `unsupported`. With
 * `DIAGRAMS_AUTOSTART_DIR`, it is an autostart entry in that folder on each system.
 */
export function createLoginItem(): LoginItem {
  const testFolder = process.env.DIAGRAMS_AUTOSTART_DIR
  if (testFolder) return autostartLoginItem(testFolder, loginCommand())
  if (!app.isPackaged) return UNSUPPORTED
  if (process.platform === 'win32') return windowsLoginItem()
  if (process.platform === 'darwin') return macLoginItem()
  return autostartLoginItem(path.join(app.getPath('appData'), 'autostart'), loginCommand())
}

/** Tells whether the system started the app at sign-in. */
export function startedAtLogin(argv: readonly string[]): boolean {
  if (argv.includes(BACKGROUND_ARG)) return true
  return process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin
}
