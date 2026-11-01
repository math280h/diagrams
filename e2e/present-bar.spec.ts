import { expect, test } from './fixtures'
import { copyTemplate } from './helpers'

test('says when a diagram has nothing to play', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New diagram' }).first().click()
  await page.getByRole('button', { name: 'Present' }).click()
  await expect(page.getByText('This diagram is empty.')).toBeVisible()
})

test('tells once that a dot marks a node with details', async ({ page }) => {
  const hint = page.getByText('A dot on a node means it has details.')
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.getByRole('button', { name: 'Present' }).click()
  await expect(hint).toBeVisible()
  await page.getByRole('button', { name: /Exit presentation/ }).click()
  await page.getByRole('button', { name: 'Present' }).click()
  await expect(page.locator('.dg-caption')).toBeVisible()
  await expect(hint).toHaveCount(0)
})
