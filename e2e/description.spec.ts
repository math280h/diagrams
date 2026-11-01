import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures'
import { copyTemplate } from './helpers'

test('describes the diagram for screen readers and as text to copy', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await copyTemplate(page, 'Order system')

  const canvas = page.getByRole('region', { name: 'Description of the diagram' })
  await expect(canvas).toContainText('The diagram has 9 parts, 1 boundary, 8 connections and 1 flow.')
  await expect(canvas.getByRole('listitem').filter({ hasText: 'Orders → Stripe: HTTPS' })).toHaveCount(1)
  await expect(canvas.locator('ol > li').first()).toHaveText('Browser: POST /orders — The shopper presses Pay.')

  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: 'Description (alt text)' }).click()
  const text = page.getByRole('textbox', { name: 'Text description' })
  await expect(text).toHaveValue(/^Order system\nThe diagram has 9 parts/)
  await expect(text).toHaveValue(/\n13\. Email worker: send confirmation \(120 ms\)/)
  const description = await text.inputValue()

  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  // The Windows clipboard gives the line ends as CRLF.
  await expect
    .poll(() => page.evaluate(async () => (await navigator.clipboard.readText()).replaceAll('\r\n', '\n')))
    .toBe(description)

  await page.getByRole('tab', { name: 'Image' }).click()
  await page.getByRole('button', { name: 'SVG', exact: true }).click()
  await expect(page.getByAltText('Export preview')).toBeVisible({ timeout: 20_000 })
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export SVG' }).click()
  const svg = await readFile(await (await download).path(), 'utf8')
  expect(svg).toMatch(/<svg\b[^>]*><title>Order system<\/title><desc>Order system\nThe diagram has 9 parts/)
})

test('describes the diagram in Present', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Checkout flow')
  await page.getByRole('button', { name: 'Present' }).click()
  const description = page.getByRole('region', { name: 'Description of the diagram' })
  await expect(description).toContainText('Flow “Returning customer”')
  await expect(description.locator('ol > li')).toHaveCount(11)
})
