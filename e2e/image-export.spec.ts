import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { copyTemplate } from './helpers'

async function openImageExport(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: /^Image/ }).click()
  await expect(page.getByAltText('Export preview')).toBeVisible({ timeout: 15_000 })
}

test('exports a PNG that holds the diagram, and imports it again', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  const nodes = await page.locator('[data-editor-canvas] .react-flow__node').count()
  await openImageExport(page)
  await page.getByRole('switch', { name: 'Keep the diagram in the file' }).click()
  await expect(page.getByText('Import can open the image again as a diagram.')).toBeVisible()
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export PNG' }).click()
  const file = await (await downloading).path()

  await page.getByRole('link', { name: 'All diagrams' }).click()
  await page.getByRole('button', { name: 'Import' }).click()
  await page.getByRole('tab', { name: 'Diagram file' }).click()
  const chooserOpens = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /Choose a \.diagram\.json file/ }).click()
  await (await chooserOpens).setFiles({ name: 'order-system.png', mimeType: 'image/png', buffer: readFileSync(file) })
  await expect(page).toHaveURL(/#\/d\//)
  await expect(page.locator('[data-editor-canvas] .react-flow__node')).toHaveCount(nodes)
})

test('says so when an image holds no diagram', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Import' }).click()
  await page.getByRole('tab', { name: 'Diagram file' }).click()
  const chooserOpens = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /Choose a \.diagram\.json file/ }).click()
  await (
    await chooserOpens
  ).setFiles({
    name: 'plain.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>'),
  })
  await expect(page.getByText('This image holds no diagram.')).toBeVisible()
})

test('copies the image, and exports only the selection', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.locator('.react-flow__node', { hasText: 'Postgres' }).first().click()
  await openImageExport(page)
  const selection = page.getByRole('switch', { name: 'Only the selection (1 node)' })
  await expect(selection).toBeChecked()
  const size = page.getByText(/^\d+ × \d+ px/)
  const selectedSize = await size.textContent()
  await selection.click()
  await expect(size).not.toHaveText(selectedSize!)

  await page.getByRole('button', { name: 'Copy PNG' }).click()
  await expect(page.getByText('Copied the PNG')).toBeVisible()
  const types = await page.evaluate(async () => (await navigator.clipboard.read()).flatMap((item) => item.types))
  expect(types).toContain('image/png')
})

test('copies the selection as a PNG with a shortcut', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.locator('.react-flow__node', { hasText: 'Postgres' }).first().click()
  await page.keyboard.press('Alt+Shift+KeyC')
  await expect(page.getByText('Copied the selection as a PNG')).toBeVisible({ timeout: 15_000 })
})
