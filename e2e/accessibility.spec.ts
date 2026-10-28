import { expect, test } from '@playwright/test'
import { copyTemplate } from './helpers'

test('names nodes, edges, fields and pages for assistive technology', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('main')).toHaveCount(1)
  await copyTemplate(page, 'Order system')
  await expect(page).toHaveTitle('Order system – Diagrams')

  const canvas = page.locator('[data-editor-canvas]')
  await expect(canvas.locator('[aria-label="Postgres, data store"]')).toHaveCount(1)
  await expect(canvas.locator('[aria-label="AWS VPC payments, boundary"]')).toHaveCount(1)
  await expect(canvas.locator('[aria-label="Browser to API gateway, HTTPS"]')).toHaveCount(1)

  await canvas.locator('[aria-label="Postgres, data store"]').click()
  const properties = page.getByRole('complementary', { name: 'Properties' })
  await expect(properties.getByRole('textbox', { name: 'Name' })).toHaveValue('Postgres')
  await expect(properties.getByRole('textbox', { name: 'Detail' })).toHaveValue('orders')
  await expect(properties.getByRole('combobox', { name: 'Kind' })).toBeVisible()

  await page.getByRole('button', { name: 'Present' }).click()
  await expect(page).toHaveTitle('Order system, Present – Diagrams')
  await page.getByRole('button', { name: /Exit presentation/ }).click()
  await page.getByRole('link', { name: 'All diagrams' }).click()
  await expect(page).toHaveTitle('Diagrams: play a request through your system')
})
