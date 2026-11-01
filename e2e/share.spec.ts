import { readFileSync } from 'node:fs'
import { expect, test } from './fixtures'
import { copyTemplate } from './helpers'

test('shares a diagram as a link that plays it and saves a copy', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Checkout flow')
  const nodeCount = await page.locator('[data-editor-canvas] .react-flow__node').count()
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: 'Share link' }).click()
  const link = page.getByRole('textbox', { name: 'Share link' })
  await expect(link).toHaveValue(/^http:\/\/127\.0\.0\.1:5173\/#\/s\/y[\w-]+x$/, { timeout: 15_000 })
  const url = await link.inputValue()

  const viewer = await page.context().newPage()
  await viewer.goto(url)
  await expect(viewer.getByRole('heading', { name: 'Checkout flow' })).toBeVisible({ timeout: 15_000 })
  await expect(viewer.locator('.react-flow__node')).toHaveCount(nodeCount)
  await expect(viewer.locator('.dg-caption')).toBeVisible()

  await viewer.mouse.move(400, 300)
  await viewer.getByRole('button', { name: 'Save a copy' }).click()
  await expect(viewer).toHaveURL(/#\/d\//)
  await expect(viewer.getByLabel('Diagram name')).toHaveValue('Checkout flow')
  await expect(viewer.locator('[data-editor-canvas] .react-flow__node')).toHaveCount(nodeCount)
})

test('explains a share link that is cut off', async ({ page }) => {
  for (const data of ['zAbCdEf', 'yAbCdEf']) {
    await page.goto(`/#/s/${data}`)
    await expect(page.getByText('This link cannot be opened')).toBeVisible()
    await expect(page.getByText('This link is not complete.')).toBeVisible()
  }
})

test('opens a share link from an earlier version', async ({ page }) => {
  await page.goto(`/#/s/${readFileSync('src/share/samples/z-checkout-flow.txt', 'utf8').trim()}`)
  await expect(page.getByRole('heading', { name: 'Checkout flow' })).toBeVisible()
  await expect(page.locator('.react-flow__node')).toHaveCount(7)
})
