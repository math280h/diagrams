import { pathToFileURL } from 'node:url'
import { expect, test } from './fixtures'
import { copyTemplate } from './helpers'

test('follows the system colour scheme until the user picks a mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  const root = page.locator('html')
  await expect(root).not.toHaveClass(/\bdark\b/)
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(root).toHaveClass(/\bdark\b/)

  await page.getByRole('button', { name: /^Theme:/ }).click()
  await page.getByRole('menuitemradio', { name: 'Light' }).click()
  await expect(root).not.toHaveClass(/\bdark\b/)
  await page.reload()
  await expect(root).not.toHaveClass(/\bdark\b/)
})

test('shows a theme from the theme menu in the app and on the canvas, from the first frame after a reload', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Theme: Dark' }).click()
  await page.getByRole('menuitemradio', { name: 'Blueprint' }).click()
  const root = page.locator('html')
  await expect(root).toHaveAttribute('data-app-theme', 'blueprint')
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(11, 35, 66)')
  await expect(page.locator('.dg-canvas').first()).toHaveAttribute('data-theme', 'blueprint')

  await page.addInitScript(() => {
    new MutationObserver((_records, observer) => {
      if (!document.body) return
      observer.disconnect()
      const html = document.documentElement
      Object.assign(window, {
        themeAtBody: `${html.dataset.appTheme}|${html.classList.contains('dark')}|${!!document.getElementById('dg-themes-boot')}`,
      })
    }).observe(document, { childList: true, subtree: true })
  })
  await page.reload()
  await expect(root).toHaveAttribute('data-app-theme', 'blueprint')
  expect(await page.evaluate(() => (window as unknown as { themeAtBody: string }).themeAtBody)).toBe(
    'blueprint|true|true',
  )
})

test('exports in the theme on screen, or in another theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: /^Image/ }).click()
  const stage = page.locator('.dg-canvas[data-export]')
  await expect(stage).toHaveAttribute('data-theme', 'light')
  await page.getByRole('combobox', { name: 'Export theme' }).click()
  await page.getByRole('option', { name: 'Circuit' }).click()
  await expect(stage).toHaveAttribute('data-theme', 'circuit')
  await expect(stage).toHaveCSS('background-color', 'rgb(11, 42, 34)')
})

test('exports a web page that shows the light or the dark theme of the export, as the reader sets', async ({
  page,
  browser,
}, testInfo) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('dg:settings')) return
    const state = { themeMode: 'light', themes: { light: 'fog', dark: 'blueprint' } }
    localStorage.setItem('dg:settings', JSON.stringify({ state, version: 1 }))
  })
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: 'Web page (HTML)' }).click()
  const downloading = page.waitForEvent('download', { timeout: 60_000 })
  await page.getByRole('button', { name: 'Download .html' }).click()
  const file = testInfo.outputPath('themed.html')
  await (await downloading).saveAs(file)

  for (const [colorScheme, theme] of [
    ['dark', 'blueprint'],
    ['light', 'fog'],
  ] as const) {
    const viewer = await (await browser.newContext({ colorScheme })).newPage()
    await viewer.goto(pathToFileURL(file).href)
    await expect(viewer.locator('.dg-canvas').first()).toHaveAttribute('data-theme', theme)
    await expect(viewer.locator('html')).toHaveAttribute('data-app-theme', theme)
    await viewer.context().close()
  }
})

test('imports a theme file into the browser, warns about weak contrast, and removes it', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('tab', { name: 'App', exact: true }).click()
  const themes = page.getByRole('group', { name: 'Your themes' })
  const chooser = page.waitForEvent('filechooser')
  await themes.getByRole('button', { name: 'Import a theme file' }).click()
  await (
    await chooser
  ).setFiles({
    name: 'Dim Ink.theme.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ name: 'Dim ink', base: 'dark', canvas: { muted: '#555555' } })),
  })
  await expect(page.locator('[data-editor-canvas] .dg-canvas')).toHaveAttribute('data-theme', 'custom:dim-ink')
  const file = page.getByRole('list', { name: 'Theme files' }).getByRole('listitem')
  await expect(file).toContainText('Dim ink')
  await expect(file).toContainText('below their contrast')

  await page.reload()
  await expect(page.locator('[data-editor-canvas] .dg-canvas')).toHaveAttribute('data-theme', 'custom:dim-ink')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('tab', { name: 'App', exact: true }).click()
  await page.getByRole('button', { name: 'Remove the theme Dim ink' }).click()
  await expect(page.locator('[data-editor-canvas] .dg-canvas')).toHaveAttribute('data-theme', 'dark')
})
