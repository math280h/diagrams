import type { MenuItemConstructorOptions, WebContents } from 'electron'
import type { EditCommand, MenuCommand } from '@/desktop/contract'
import { APP_NAME } from './paths'

export type HelpLink = 'website' | 'whats-new' | 'source-code'

export interface AppMenuState {
  /** True on the Vite dev server. The View menu then also has the developer tools. */
  development: boolean
  /** True if this build checks for updates. */
  updates: boolean
}

export interface AppMenuActions {
  /** Runs a command in the app window. */
  run(command: MenuCommand): void
  edit(command: EditCommand): void
  open(link: HelpLink): void
  /**
   * Reloads the page of the app window, after the save of the open diagram.
   *
   * @param ignoreCache - If true, the page loads its files again without the cache.
   */
  reload(ignoreCache: boolean): void
}

const SEPARATOR: MenuItemConstructorOptions = { type: 'separator' }

/**
 * Returns the template of the macOS menu bar, or `null` on other systems. Windows and Linux keep the menu of
 * `createMainWindow`.
 */
export function appMenuTemplate(
  platform: NodeJS.Platform,
  state: AppMenuState,
  actions: AppMenuActions,
): MenuItemConstructorOptions[] | null {
  if (platform !== 'darwin') return null
  const command = (id: MenuCommand, label: string, accelerator?: string): MenuItemConstructorOptions => ({
    id,
    label,
    ...(accelerator ? { accelerator } : {}),
    click: () => actions.run(id),
  })
  const edit = (id: EditCommand, label: string, accelerator?: string): MenuItemConstructorOptions => ({
    id,
    label,
    ...(accelerator ? { accelerator } : {}),
    click: () => actions.edit(id),
  })
  const developerTools: MenuItemConstructorOptions[] = state.development
    ? [{ role: 'toggleDevTools', label: 'Toggle developer tools', accelerator: 'Alt+Command+I' }]
    : []
  const link = (id: HelpLink, label: string): MenuItemConstructorOptions => ({
    id,
    label,
    click: () => actions.open(id),
  })
  return [
    {
      label: APP_NAME,
      submenu: [
        { role: 'about' },
        ...(state.updates ? [command('check-for-updates', 'Check for updates…')] : []),
        SEPARATOR,
        command('settings', 'Settings…', 'Command+,'),
        SEPARATOR,
        { role: 'services' },
        SEPARATOR,
        { role: 'hide', accelerator: 'Command+H' },
        { role: 'hideOthers', accelerator: 'Alt+Command+H' },
        { role: 'unhide' },
        SEPARATOR,
        { role: 'quit', accelerator: 'Command+Q' },
      ],
    },
    {
      label: 'File',
      submenu: [
        command('new-diagram', 'New diagram', 'Command+N'),
        command('open-files', 'Open…', 'Command+O'),
        SEPARATOR,
        { id: 'close-window', role: 'close', label: 'Close window', accelerator: 'Command+W' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        edit('undo', 'Undo', 'Command+Z'),
        edit('redo', 'Redo', 'Shift+Command+Z'),
        SEPARATOR,
        { id: 'cut', role: 'cut', label: 'Cut', accelerator: 'Command+X' },
        { id: 'copy', role: 'copy', label: 'Copy', accelerator: 'Command+C' },
        { id: 'paste', role: 'paste', label: 'Paste', accelerator: 'Command+V' },
        {
          id: 'paste-and-match-style',
          role: 'pasteAndMatchStyle',
          label: 'Paste and match style',
          accelerator: 'Alt+Shift+Command+V',
        },
        edit('delete', 'Delete'),
        edit('select-all', 'Select all', 'Command+A'),
        SEPARATOR,
        {
          label: 'Speech',
          submenu: [
            { role: 'startSpeaking', label: 'Start speaking' },
            { role: 'stopSpeaking', label: 'Stop speaking' },
          ],
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { id: 'reload', label: 'Reload', accelerator: 'Command+R', click: () => actions.reload(false) },
        {
          id: 'force-reload',
          label: 'Force reload',
          accelerator: 'Shift+Command+R',
          click: () => actions.reload(true),
        },
        ...developerTools,
        SEPARATOR,
        { role: 'resetZoom', label: 'Actual size', accelerator: 'Command+0' },
        { role: 'zoomIn', label: 'Zoom in', accelerator: 'Command+Plus' },
        { id: 'zoom-in-equals', role: 'zoomIn', label: 'Zoom in', accelerator: 'Command+=', visible: false },
        { role: 'zoomOut', label: 'Zoom out', accelerator: 'Command+-' },
        SEPARATOR,
        { role: 'togglefullscreen', accelerator: 'Control+Command+F' },
      ],
    },
    {
      label: 'Window',
      role: 'window',
      submenu: [{ role: 'minimize', accelerator: 'Command+M' }, { role: 'zoom' }, SEPARATOR, { role: 'front' }],
    },
    {
      label: 'Help',
      role: 'help',
      submenu: [
        link('website', `${APP_NAME} website`),
        link('whats-new', 'What’s new'),
        command('shortcuts', 'Keyboard shortcuts'),
        SEPARATOR,
        command('problem-reports', 'Report a problem…'),
        link('source-code', 'Source code on GitHub'),
      ],
    },
  ]
}

/** The part of a page that runs the edit commands of the system. */
export type NativeEditor = Pick<WebContents, 'id' | 'isDestroyed' | 'undo' | 'redo' | 'delete' | 'selectAll'>

const NATIVE_EDITS: Record<EditCommand, (page: NativeEditor) => void> = {
  undo: (page) => page.undo(),
  redo: (page) => page.redo(),
  delete: (page) => page.delete(),
  'select-all': (page) => page.selectAll(),
}

/**
 * Runs an edit command of the menu bar. The app window runs it on the canvas first. When the app does not run it, or
 * another page has the focus, the command of the system runs in the focused page.
 *
 * @param focused - The page with the focus, or `null`.
 * @param appPage - The page of the app window, or `null`.
 * @param editInApp - Sends the command to the app window. It resolves with true if the app ran the command.
 */
export async function runEditCommand(
  command: EditCommand,
  focused: NativeEditor | null,
  appPage: NativeEditor | null,
  editInApp: (command: EditCommand) => Promise<boolean>,
): Promise<void> {
  const page = focused ?? appPage
  if (!page) return
  if (page.id === appPage?.id && (await editInApp(command).catch(() => false))) return
  if (!page.isDestroyed()) NATIVE_EDITS[command](page)
}
