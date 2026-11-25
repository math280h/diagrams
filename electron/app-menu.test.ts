import type { MenuItemConstructorOptions } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import type { EditCommand } from '@/desktop/contract'
import { type AppMenuActions, type AppMenuState, appMenuTemplate, runEditCommand } from './app-menu'

vi.mock('electron', () => ({ app: {} }))

const PRODUCTION: AppMenuState = { development: false, updates: true }

const MENU_ITEM_OF_SHORTCUT: Record<string, string> = {
  undo: 'undo',
  redo: 'redo',
  cut: 'cut',
  copy: 'copy',
  paste: 'paste',
  selectAll: 'select-all',
}

const MAC_MODIFIERS: Record<string, string> = { '⌥': 'Alt', '⇧': 'Shift', '⌘': 'Command', '⌃': 'Control' }

function fakeActions() {
  return { run: vi.fn(), edit: vi.fn(), open: vi.fn(), reload: vi.fn() } satisfies AppMenuActions
}

function template(platform: NodeJS.Platform = 'darwin', state = PRODUCTION, actions = fakeActions()) {
  const menu = appMenuTemplate(platform, state, actions)
  if (!menu) throw new Error('No menu template.')
  return menu
}

function submenu(item: MenuItemConstructorOptions): MenuItemConstructorOptions[] {
  return Array.isArray(item.submenu) ? item.submenu : []
}

function allItems(items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return items.flatMap((item) => [item, ...allItems(submenu(item))])
}

function menuNamed(items: MenuItemConstructorOptions[], label: string) {
  const menu = items.find((item) => item.label === label)
  if (!menu) throw new Error(`No ${label} menu.`)
  return submenu(menu)
}

function names(items: MenuItemConstructorOptions[]) {
  return items.map((item) => (item.type === 'separator' ? '-' : (item.id ?? item.role ?? item.label)))
}

function itemWithId(items: MenuItemConstructorOptions[], id: string) {
  const item = allItems(items).find((candidate) => candidate.id === id)
  if (!item) throw new Error(`No item ${id}.`)
  return item
}

function click(item: MenuItemConstructorOptions) {
  ;(item.click as () => void)()
}

function keyOf(accelerator: string) {
  const parts = accelerator.split('+')
  const key = parts.pop()!.toUpperCase()
  return [...parts.toSorted(), key].join('+')
}

function keyOfMacNotation(keys: string): string | null {
  const modifiers: string[] = []
  let rest = keys
  while (rest.length > 1 && MAC_MODIFIERS[rest[0]!]) {
    modifiers.push(MAC_MODIFIERS[rest[0]!]!)
    rest = rest.slice(1)
  }
  return modifiers.length === 0 ? null : keyOf([...modifiers, rest].join('+'))
}

async function macAppShortcuts(): Promise<Record<string, string>> {
  vi.resetModules()
  vi.stubGlobal('navigator', { platform: 'MacIntel' })
  try {
    const { KEYS } = await import('@/lib/shortcut-keys')
    return { ...KEYS }
  } finally {
    vi.unstubAllGlobals()
  }
}

describe('appMenuTemplate', () => {
  it('gives no menu bar to Windows and Linux, which keep their own menu', () => {
    expect(appMenuTemplate('win32', PRODUCTION, fakeActions())).toBeNull()
    expect(appMenuTemplate('linux', PRODUCTION, fakeActions())).toBeNull()
  })

  it('has the menus of a macOS app in their usual order', () => {
    expect(template().map((item) => item.label)).toEqual(['Diagrams', 'File', 'Edit', 'View', 'Window', 'Help'])
    const menu = template()
    expect(names(menuNamed(menu, 'Diagrams'))).toEqual([
      'about',
      'check-for-updates',
      '-',
      'settings',
      '-',
      'services',
      '-',
      'hide',
      'hideOthers',
      'unhide',
      '-',
      'quit',
    ])
    expect(names(menuNamed(menu, 'File'))).toEqual(['new-diagram', 'open-files', '-', 'close-window'])
    expect(names(menuNamed(menu, 'Edit'))).toEqual([
      'undo',
      'redo',
      '-',
      'cut',
      'copy',
      'paste',
      'paste-and-match-style',
      'delete',
      'select-all',
      '-',
      'Speech',
    ])
    expect(names(menuNamed(menu, 'View'))).toContain('togglefullscreen')
    expect(names(menuNamed(menu, 'Window'))).toEqual(['minimize', 'zoom', '-', 'front'])
    expect(names(menuNamed(menu, 'Help'))).toEqual([
      'website',
      'whats-new',
      'shortcuts',
      '-',
      'problem-reports',
      'source-code',
    ])
  })

  it('gives the Window and Help menus their macOS roles, so that macOS adds the window list and the help search', () => {
    const menu = template()
    expect(menu.find((item) => item.label === 'Window')?.role).toBe('window')
    expect(menu.find((item) => item.label === 'Help')?.role).toBe('help')
  })

  it('quits and closes the window through the roles of Electron, which follow the quit and close rules of the app', () => {
    const items = allItems(template())
    expect(items.find((item) => item.role === 'quit')?.click).toBeUndefined()
    expect(itemWithId(template(), 'close-window').role).toBe('close')
  })

  it('shows "Check for updates" only in a build that checks for updates', () => {
    expect(allItems(template('darwin', { development: false, updates: false })).map((item) => item.id)).not.toContain(
      'check-for-updates',
    )
  })

  it('has no developer tools in a production build', () => {
    expect(allItems(template()).map((item) => item.role?.toLowerCase())).not.toContain('toggledevtools')
  })

  it('keeps reload, force reload, page zoom and full screen in a production build', () => {
    const view = menuNamed(template(), 'View')
    expect(names(view)).toEqual([
      'reload',
      'force-reload',
      '-',
      'resetZoom',
      'zoomIn',
      'zoom-in-equals',
      'zoomOut',
      '-',
      'togglefullscreen',
    ])
    const accelerators = view.map((item) => item.accelerator)
    expect(accelerators).toEqual(
      expect.arrayContaining(['Command+R', 'Shift+Command+R', 'Command+0', 'Command+Plus', 'Command+=', 'Command+-']),
    )
    const equals = itemWithId(view, 'zoom-in-equals')
    expect(equals).toMatchObject({ role: 'zoomIn', visible: false })
    expect(equals.acceleratorWorksWhenHidden).not.toBe(false)
  })

  it('adds the developer tools on the dev server', () => {
    const menu = template('darwin', { development: true, updates: false })
    expect(names(menuNamed(menu, 'View'))).toEqual([
      'reload',
      'force-reload',
      'toggleDevTools',
      '-',
      'resetZoom',
      'zoomIn',
      'zoom-in-equals',
      'zoomOut',
      '-',
      'togglefullscreen',
    ])
  })

  it('reloads through the app, which saves the open diagram first, and not through the reload roles', () => {
    const actions = fakeActions()
    const menu = template('darwin', PRODUCTION, actions)
    const roles = allItems(menu).map((item) => item.role?.toLowerCase())
    expect(roles).not.toContain('reload')
    expect(roles).not.toContain('forcereload')
    click(itemWithId(menu, 'reload'))
    expect(actions.reload).toHaveBeenLastCalledWith(false)
    click(itemWithId(menu, 'force-reload'))
    expect(actions.reload).toHaveBeenLastCalledWith(true)
  })

  it('sends the app commands, the edit commands and the links to their actions', () => {
    const actions = fakeActions()
    const menu = template('darwin', PRODUCTION, actions)
    for (const id of ['settings', 'check-for-updates', 'new-diagram', 'open-files', 'shortcuts', 'problem-reports']) {
      click(itemWithId(menu, id))
      expect(actions.run).toHaveBeenLastCalledWith(id)
    }
    for (const id of ['undo', 'redo', 'delete', 'select-all']) {
      click(itemWithId(menu, id))
      expect(actions.edit).toHaveBeenLastCalledWith(id)
    }
    for (const id of ['website', 'whats-new', 'source-code']) {
      click(itemWithId(menu, id))
      expect(actions.open).toHaveBeenLastCalledWith(id)
    }
  })

  it('cuts, copies and pastes through the roles, which send the clipboard events that the canvas reads', () => {
    const menu = template()
    for (const [id, role] of [
      ['cut', 'cut'],
      ['copy', 'copy'],
      ['paste', 'paste'],
      ['paste-and-match-style', 'pasteAndMatchStyle'],
    ]) {
      const item = itemWithId(menu, id!)
      expect(item.role).toBe(role)
      expect(item.click).toBeUndefined()
    }
    for (const id of ['undo', 'redo', 'delete', 'select-all']) expect(itemWithId(menu, id).role).toBeUndefined()
  })

  it('gives each key to one menu item only', () => {
    const keys = allItems(template('darwin', { development: true, updates: true }))
      .flatMap((item) => (item.accelerator ? [keyOf(item.accelerator)] : []))
      .toSorted()
    expect(keys).toEqual([...new Set(keys)].toSorted())
  })

  it('uses a key of an app shortcut only for the same action', async () => {
    const shortcuts = await macAppShortcuts()
    expect(shortcuts.redo).toBe('⇧⌘Z')
    const items = allItems(template('darwin', { development: true, updates: true }))
    for (const [name, keys] of Object.entries(shortcuts)) {
      const key = keyOfMacNotation(keys)
      if (!key) continue
      const taken = items.filter((item) => item.accelerator && keyOf(item.accelerator) === key)
      expect(
        taken.map((item) => item.id),
        `${name} (${keys})`,
      ).toEqual(MENU_ITEM_OF_SHORTCUT[name] ? [MENU_ITEM_OF_SHORTCUT[name]] : [])
    }
  })

  it('writes the labels of the app in sentence case', () => {
    const proper = new Set(['Diagrams', 'GitHub'])
    for (const item of allItems(template('darwin', { development: true, updates: true }))) {
      if (!item.label) continue
      const later = item.label.split(' ').slice(1)
      expect(
        later.filter((word) => /^[A-Z]/.test(word) && !proper.has(word)),
        item.label,
      ).toEqual([])
    }
  })
})

function fakePage(id: number) {
  return { id, isDestroyed: () => false, undo: vi.fn(), redo: vi.fn(), delete: vi.fn(), selectAll: vi.fn() }
}

describe('runEditCommand', () => {
  it('lets the app run the command on the canvas, and then runs no command of the system', async () => {
    const app = fakePage(1)
    const editInApp = vi.fn(async () => true)
    await runEditCommand('undo', app, app, editInApp)
    expect(editInApp).toHaveBeenCalledWith('undo')
    expect(app.undo).not.toHaveBeenCalled()
  })

  it('runs the command of the system when the app does not take it, for example in a text field', async () => {
    const app = fakePage(1)
    const commands: [EditCommand, 'undo' | 'redo' | 'delete' | 'selectAll'][] = [
      ['undo', 'undo'],
      ['redo', 'redo'],
      ['delete', 'delete'],
      ['select-all', 'selectAll'],
    ]
    for (const [command, method] of commands) {
      await runEditCommand(command, app, app, async () => false)
      expect(app[method]).toHaveBeenCalledTimes(1)
    }
  })

  it('runs the command of the system when the app window does not answer', async () => {
    const app = fakePage(1)
    await runEditCommand('redo', app, app, () => Promise.reject(new Error('The app window reloaded.')))
    expect(app.redo).toHaveBeenCalledTimes(1)
  })

  it('runs the command of the system in another focused page, such as the developer tools', async () => {
    const app = fakePage(1)
    const tools = fakePage(2)
    const editInApp = vi.fn(async () => true)
    await runEditCommand('select-all', tools, app, editInApp)
    expect(editInApp).not.toHaveBeenCalled()
    expect(tools.selectAll).toHaveBeenCalledTimes(1)
    expect(app.selectAll).not.toHaveBeenCalled()
  })

  it('sends the command to the app window when no page has the focus', async () => {
    const app = fakePage(1)
    const editInApp = vi.fn(async () => true)
    await runEditCommand('undo', null, app, editInApp)
    expect(editInApp).toHaveBeenCalledWith('undo')
  })

  it('does nothing without a page, or when the page closes before the answer', async () => {
    await expect(runEditCommand('undo', null, null, async () => false)).resolves.toBeUndefined()
    const app = { ...fakePage(1), isDestroyed: () => true }
    await runEditCommand('undo', app, app, async () => false)
    expect(app.undo).not.toHaveBeenCalled()
  })
})
