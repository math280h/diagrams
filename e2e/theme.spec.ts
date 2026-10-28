import { expect, test } from '@playwright/test'

test('follows the system colour scheme until the user picks a theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  const root = page.locator('html')
  await expect(root).not.toHaveClass(/\bdark\b/)
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(root).toHaveClass(/\bdark\b/)

  await page.getByRole('button', { name: /^Theme:/ }).click()
  await page.getByRole('menuitemradio', { name: 'Light' }).click()
  await expect(root).not.toHaveClass(/\bdark\b/)
  await page.reload()
  await expect(root).not.toHaveClass(/\bdark\b/)
})
