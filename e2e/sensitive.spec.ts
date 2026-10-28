import { expect, test } from '@playwright/test'
import { copyTemplate } from './helpers'

test('shows the connections that carry sensitive data, and marks a field as a secret', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.getByRole('button', { name: 'Sensitive data' }).click()

  const panel = page.getByRole('complementary', { name: 'Sensitive data' })
  await expect(panel).toContainText('3 connections carry sensitive data. 1 crosses a trust boundary.')
  const panelBox = (await panel.boundingBox())!
  const canvasBox = (await page.locator('[data-editor-canvas]').boundingBox())!
  expect(canvasBox.x).toBeGreaterThanOrEqual(panelBox.x + panelBox.width - 1)
  await expect(panel.getByRole('listitem').first()).toContainText('Orders → Stripe')
  await expect(panel.getByRole('listitem').first()).toContainText('Crosses AWS VPC payments.')
  const labels = page.locator('.dg-edge-label')
  await expect(labels.and(page.locator('[data-sensitive]'))).toHaveCount(3)
  await expect(labels.and(page.locator('[data-sensitive="personal"][data-crossing]'))).toHaveCount(1)

  await panel.getByRole('button', { name: /Orders → Stripe/ }).click()
  const properties = page.getByRole('complementary', { name: 'Properties' })
  await expect(properties.getByText('customer (personal data)', { exact: true })).toBeVisible()
  await expect(properties.getByText('Crosses AWS VPC payments.')).toBeVisible()

  await labels.filter({ hasText: '{4} → {2}' }).click()
  await page.getByRole('button', { name: 'paymentMethod, string' }).click()
  await page.getByRole('combobox', { name: 'Data' }).click()
  await page.getByRole('option', { name: 'Secret' }).click()
  await expect(page.getByRole('button', { name: 'paymentMethod, string, secret' })).toBeVisible()
  await expect(panel).toContainText('4 connections carry sensitive data. 2 cross a trust boundary.')
  await expect(panel.getByRole('listitem').first()).toContainText('Browser → API gateway')
  await expect(labels.and(page.locator('[data-sensitive="secret"][data-crossing]'))).toHaveCount(1)

  await panel.getByRole('button', { name: 'Hide sensitive data' }).click()
  await expect(page.locator('.dg-canvas[data-threats]')).toHaveCount(0)
  await expect(labels.and(page.locator('[data-sensitive]'))).toHaveCount(0)
})
