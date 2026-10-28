import { expect, test, type Page } from '@playwright/test'
import { copyTemplate } from './helpers'

function card(page: Page, title: string) {
  return page
    .locator('.react-flow__node')
    .filter({ has: page.locator('.dg-card-title', { hasText: new RegExp(`^${title}$`) }) })
    .first()
}

test('opens the diagram inside a card in the editor and zooms into it in Present', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  const parentUrl = page.url()
  await card(page, 'Orders').click()
  const panel = page.getByRole('complementary', { name: 'Properties' })
  await panel.getByRole('button', { name: 'New diagram for its inside' }).click()
  await expect(panel.getByRole('button', { name: 'Open Orders' })).toBeVisible()

  await card(page, 'Orders').getByRole('button', { name: 'Open Orders' }).click()
  await expect(page.getByLabel('Diagram name')).toHaveValue('Orders')
  await page.goto(parentUrl)
  await expect(page.getByLabel('Diagram name')).toHaveValue('Order system')

  await page.getByRole('button', { name: 'Present' }).click()
  await expect(page).toHaveURL(/#\/p\//)
  await page.mouse.move(720, 450)
  await page.mouse.wheel(0, 1200)
  await card(page, 'Orders').getByRole('button', { name: 'Open Orders' }).click()
  await expect(page).toHaveURL(/#\/p\/[^?]+\?from=/)
  await expect(page.getByText('This diagram has no flow.')).toBeVisible()
  await page.getByRole('button', { name: 'Order system' }).click()
  await expect(
    page.getByRole('button', { name: 'Place an order' }).or(page.getByText('Place an order', { exact: true })),
  ).toBeVisible()
})
