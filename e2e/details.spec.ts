import { expect, test, type Page } from '@playwright/test'
import { copyTemplate } from './helpers'

function card(page: Page, title: string) {
  return page
    .locator('.react-flow__node')
    .filter({ has: page.locator('.dg-card-title', { hasText: new RegExp(`^${title}$`) }) })
    .first()
}

test('shows the details of a node on hover and on click in Present', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.getByRole('button', { name: 'Present' }).click()
  await expect(page).toHaveURL(/#\/p\//)
  await expect(page.locator('.dg-caption')).toContainText('The shopper presses Pay.')
  await page.mouse.move(720, 450)
  await page.mouse.wheel(0, 1200)

  await card(page, 'Orders').hover()
  const orders = page.getByRole('complementary', { name: 'Details of Orders' })
  await expect(orders).toContainText('Owner: Checkout team')
  await expect(orders).toContainText('publishes order.created')
  await page.mouse.move(5, 400)
  await expect(orders).toBeHidden()

  await card(page, 'Stripe').click()
  const stripe = page.getByRole('complementary', { name: 'Details of Stripe' })
  await expect(stripe.getByRole('link', { name: 'Payment Intents API' })).toHaveAttribute(
    'href',
    'https://docs.stripe.com/api/payment_intents',
  )
  await page.mouse.move(5, 400)
  await expect(stripe).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(stripe).toBeHidden()
  await expect(page).toHaveURL(/#\/p\//)
})

test('edits the details of a node in the properties panel', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await card(page, 'Auth').click()
  const panel = page.getByRole('complementary', { name: 'Properties' })
  await panel.getByRole('group', { name: 'Owner' }).getByRole('textbox').fill('Identity team')
  await panel
    .getByLabel('Description')
    .fill('Signs people in. See https://openid.net/developers/how-connect-works/ for the flow.')
  await panel.getByRole('button', { name: 'Add a link' }).click()
  const link = panel.getByRole('group', { name: 'Link' })
  await link.getByPlaceholder('https://').fill('javascript:alert(1)')
  await expect(panel).toContainText('Use a web address')
  await link.getByPlaceholder('https://').fill('status.acme.dev')
  await link.getByPlaceholder('Runbook').fill('Status page')
  await expect(panel).not.toContainText('Use a web address')

  await page.getByRole('button', { name: 'Present' }).click()
  await expect(page.locator('.dg-caption')).toContainText('The shopper presses Pay.')
  await page.mouse.move(720, 450)
  await page.mouse.wheel(0, 1200)
  await card(page, 'Auth').hover()
  const details = page.getByRole('complementary', { name: 'Details of Auth' })
  await expect(details).toContainText('Owner: Identity team')
  await expect(details.getByRole('link', { name: 'https://openid.net/developers/how-connect-works/' })).toBeVisible()
  await expect(details.getByRole('link', { name: 'Status page' })).toHaveAttribute('href', 'https://status.acme.dev/')
})
