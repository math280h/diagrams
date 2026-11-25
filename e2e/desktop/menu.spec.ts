import type { ElectronApplication, Page } from '@playwright/test'
import { DEFAULT_DIAGRAM_NAME } from '@/model/defaults'
import { expect, test } from './fixtures'

interface MenuEntry {
  label: string
  id: string
  role: string | null
  submenu: MenuEntry[] | null
}

test.skip(process.platform !== 'darwin', 'Only macOS has the menu bar of the app.')

function appMenu(app: ElectronApplication): Promise<MenuEntry[]> {
  return app.evaluate(({ Menu }) => {
    const entries = (menu: Electron.Menu): MenuEntry[] =>
      menu.items.map((item) => ({
        label: item.label,
        id: item.id,
        role: item.role?.toLowerCase() ?? null,
        submenu: item.submenu ? entries(item.submenu) : null,
      }))
    const menu = Menu.getApplicationMenu()
    return menu ? entries(menu) : []
  })
}

async function clickMenuItem(app: ElectronApplication, id: string) {
  await app.evaluate(({ Menu }, itemId) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(itemId)
    if (!item) throw new Error(`The menu bar has no item ${itemId}.`)
    ;(item.click as () => void)()
  }, id)
}

async function newDiagram(app: ElectronApplication, window: Page) {
  await expect(window.getByRole('button', { name: 'New diagram' })).toBeVisible()
  await clickMenuItem(app, 'new-diagram')
  await expect(window).toHaveURL(/#\/d\//)
  await expect(window.getByLabel('Diagram name')).toHaveValue(DEFAULT_DIAGRAM_NAME)
}

test('has the menus of a macOS app, without developer tools in a build without the dev server', async ({
  app,
  window,
}) => {
  await expect(window.getByRole('button', { name: 'New diagram' })).toBeVisible()
  const menu = await appMenu(app)
  expect(menu.map((entry) => entry.label)).toEqual(['Diagrams', 'File', 'Edit', 'View', 'Window', 'Help'])
  const all = (entries: MenuEntry[]): MenuEntry[] => entries.flatMap((entry) => [entry, ...all(entry.submenu ?? [])])
  const roles = all(menu).map((entry) => entry.role)
  expect(roles).not.toContain('toggledevtools')
  expect(roles).toEqual(
    expect.arrayContaining([
      'about',
      'services',
      'hide',
      'quit',
      'copy',
      'paste',
      'resetzoom',
      'zoomin',
      'zoomout',
      'togglefullscreen',
      'window',
    ]),
  )
  const ids = all(menu).map((entry) => entry.id)
  expect(ids).toEqual(expect.arrayContaining(['reload', 'force-reload']))
  expect(ids).not.toContain('check-for-updates')
})

test('reloads the page from the View menu after it saves the last change', async ({ app, window }) => {
  await newDiagram(app, window)
  const name = window.getByLabel('Diagram name')
  await name.fill('Kept over the reload')
  await name.press('Enter')
  await window.evaluate(() => {
    ;(globalThis as { beforeReload?: boolean }).beforeReload = true
  })

  await clickMenuItem(app, 'reload')
  // Playwright rejects an evaluate while the page navigates, so the poll counts that as the old page.
  await expect
    .poll(() =>
      window.evaluate(() => (globalThis as { beforeReload?: boolean }).beforeReload ?? false).catch(() => true),
    )
    .toBe(false)
  await expect(name).toHaveValue('Kept over the reload')
})

test('opens the settings, the keyboard shortcuts and a new diagram from the menu bar', async ({ app, window }) => {
  await expect(window.getByRole('button', { name: 'New diagram' })).toBeVisible()
  await clickMenuItem(app, 'settings')
  await expect(window.getByRole('dialog', { name: 'App settings' })).toBeVisible()
  await window.keyboard.press('Escape')
  await expect(window.getByRole('dialog')).toHaveCount(0)

  await clickMenuItem(app, 'shortcuts')
  await expect(window.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
  await window.keyboard.press('Escape')
  await expect(window.getByRole('dialog')).toHaveCount(0)

  await newDiagram(app, window)
})

test('undoes on the canvas, and selects the text of a field, from the Edit menu', async ({ app, window }) => {
  await newDiagram(app, window)
  const name = window.getByLabel('Diagram name')
  await name.fill('Renamed by hand')
  await name.press('Enter')
  await name.evaluate((input: HTMLInputElement) => input.blur())

  await clickMenuItem(app, 'undo')
  await expect(name).toHaveValue(DEFAULT_DIAGRAM_NAME)
  await clickMenuItem(app, 'redo')
  await expect(name).toHaveValue('Renamed by hand')

  await name.focus()
  await name.evaluate((input: HTMLInputElement) => input.setSelectionRange(0, 0))
  await clickMenuItem(app, 'select-all')
  await expect
    .poll(() => name.evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd]))
    .toEqual([0, 'Renamed by hand'.length])
  await expect(name).toHaveValue('Renamed by hand')
})
