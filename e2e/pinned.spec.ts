import { expect, test, type Page } from '@playwright/test'
import { copyTemplate } from './helpers'

function card(page: Page, title: string) {
  return page
    .locator('[data-editor-canvas] .react-flow__node')
    .filter({ has: page.locator('.dg-card-title', { hasText: new RegExp(`^${title}$`) }) })
    .first()
}

function canvasPosition(page: Page, title: string) {
  return card(page, title).evaluate((element) => (element as HTMLElement).style.transform)
}

test('keeps a pinned node in its place when Tidy up arranges the rest', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await card(page, 'Stripe').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Pin position' }).click()
  await expect(card(page, 'Stripe')).toHaveClass(/dg-pinned/)

  const stripe = await canvasPosition(page, 'Stripe')
  const orders = await canvasPosition(page, 'Orders')
  await page.locator('[data-editor-canvas] .react-flow__pane').click({ button: 'right', position: { x: 20, y: 20 } })
  await page.getByRole('menuitem', { name: /Tidy up, top to bottom/ }).click()
  await expect.poll(() => canvasPosition(page, 'Orders')).not.toBe(orders)
  expect(await canvasPosition(page, 'Stripe')).toBe(stripe)

  await card(page, 'Stripe').click()
  const panel = page.getByRole('complementary', { name: 'Properties' })
  const pin = panel.getByRole('switch', { name: 'Pin position' })
  await expect(pin).toBeChecked()
  await pin.click()
  await expect(card(page, 'Stripe')).not.toHaveClass(/dg-pinned/)
  await page.keyboard.press('Control+z')
  await expect(card(page, 'Stripe')).toHaveClass(/dg-pinned/)
})
