import { expect, test } from '@playwright/test'
import { copyTemplate } from './helpers'

test('inserts the product that the search names', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  const nodes = page.locator('[data-editor-canvas] .react-flow__node')
  const before = await nodes.count()
  await page.getByRole('button', { name: 'Insert' }).click()
  await page.keyboard.type('postgres')
  await expect(page.getByRole('option').first()).toContainText('PostgreSQL')
  await expect(page.getByRole('option', { name: /Service/ })).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(nodes).toHaveCount(before + 1)
  await expect(nodes.filter({ hasText: 'PostgreSQL' })).toHaveCount(1)
})
