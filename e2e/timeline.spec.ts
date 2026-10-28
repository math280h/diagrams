import { expect, test } from '@playwright/test'
import { copyTemplate } from './helpers'

test('names each edge step on the timeline by its event', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.getByRole('button', { name: 'Flows' }).click()
  await page.getByRole('button', { name: 'Timeline', exact: true }).click()
  const block = page.getByTitle('Browser → API gateway: TLS 1.3', { exact: true })
  await expect(block).toHaveText('→ TLS 1.3')
  await expect(page.getByTitle('Orders → order.created: produce order.created', { exact: true })).toBeVisible()
})
