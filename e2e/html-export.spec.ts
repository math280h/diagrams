import { pathToFileURL } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { copyTemplate } from './helpers'

async function exportPage(page: Page, path: string) {
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: 'Web page (HTML)' }).click()
  const downloading = page.waitForEvent('download', { timeout: 60_000 })
  await page.getByRole('button', { name: 'Download .html' }).click()
  const download = await downloading
  await download.saveAs(path)
  return download.suggestedFilename()
}

test('exports a web page that plays the flow with no network', async ({ page, browser }, testInfo) => {
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  const nodeCount = await page.locator('[data-editor-canvas] .react-flow__node').count()
  const file = testInfo.outputPath('order-system.html')
  expect(await exportPage(page, file)).toBe('order-system.html')

  const offline = await browser.newContext({ offline: true, viewport: { width: 1280, height: 800 } })
  const viewer = await offline.newPage()
  const errors: string[] = []
  viewer.on('pageerror', (error) => errors.push(error.message))
  await viewer.goto(pathToFileURL(file).href)
  await expect(viewer).toHaveTitle('Order system')
  await expect(viewer.locator('.react-flow__node')).toHaveCount(nodeCount)
  await expect(viewer.locator('.react-flow__node', { hasText: 'payments' }).locator('img').first()).toBeVisible()
  await expect(viewer.locator('.react-flow__node', { hasText: 'Postgres' }).locator('svg path').first()).toBeAttached()
  await expect(viewer.locator('.dg-caption')).toContainText('The shopper presses Pay.')
  await expect(viewer.locator('.dg-caption')).toContainText('route /orders', { timeout: 10_000 })

  await viewer.mouse.move(400, 300)
  await viewer.getByRole('button', { name: 'Pause' }).click()
  await viewer.getByRole('button', { name: 'Restart' }).click()
  await viewer.getByRole('button', { name: 'Next step' }).click()
  await expect(viewer.locator('.dg-caption')).toContainText('The gateway checks the session')
  expect(errors).toEqual([])
  await offline.close()
})

test('lets the viewer of a web page pick a flow', async ({ page, browser }, testInfo) => {
  await page.goto('/')
  await copyTemplate(page, 'Collaborative editor')
  const file = testInfo.outputPath('editor.html')
  await exportPage(page, file)

  const viewer = await (await browser.newContext({ offline: true })).newPage()
  await viewer.goto(pathToFileURL(file).href)
  await expect(
    viewer.locator('.react-flow__node', { hasText: 'Undo manager' }).locator('svg path').first(),
  ).toBeAttached()
  await viewer.mouse.move(300, 300)
  const picker = viewer.getByRole('button', { name: 'Two people edit a page' })
  await picker.click()
  await viewer.getByRole('menuitemradio', { name: 'Back online' }).click()
  await expect(viewer).toHaveURL(/#flow=/)
  await viewer.mouse.move(320, 320)
  await expect(viewer.getByRole('button', { name: 'Back online' })).toBeVisible()
})
