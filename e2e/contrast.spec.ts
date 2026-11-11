import { expect, test } from './fixtures'
import { copyTemplate } from './helpers'

test('uses the high contrast theme while the system asks for more contrast, keeps a choice, and exports it', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light', contrast: 'more' })
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  const canvas = page.locator('[data-editor-canvas] .dg-canvas')
  await expect(canvas).toHaveAttribute('data-theme', 'light-high-contrast')
  const card = page.locator('[data-editor-canvas] .dg-card').first()
  const highOutline = await card.evaluate((element) => getComputedStyle(element).borderTopColor)

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('tab', { name: 'App', exact: true }).click()
  await page.getByRole('combobox', { name: 'High contrast light theme' }).click()
  await page.getByRole('option', { name: 'Keep the light theme' }).click()
  await expect(canvas).toHaveAttribute('data-theme', 'light')
  await expect.poll(() => card.evaluate((element) => getComputedStyle(element).borderTopColor)).not.toBe(highOutline)

  await page.emulateMedia({ contrast: 'no-preference' })
  await page.getByRole('combobox', { name: 'Light theme', exact: true }).click()
  await page.getByRole('option', { name: 'Light high contrast' }).click()
  await expect(canvas).toHaveAttribute('data-theme', 'light-high-contrast')
  await page.reload()
  await expect(canvas).toHaveAttribute('data-theme', 'light-high-contrast')

  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: /^Image/ }).click()
  const stage = page.locator('.dg-canvas[data-export]')
  await expect(stage).toHaveCount(1)
  await expect(stage).toHaveAttribute('data-theme', 'light-high-contrast')
})

test('picks a high contrast theme from the theme menu in the library', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await page.getByRole('button', { name: /^Theme:/ }).click()
  await page.getByRole('menuitemradio', { name: 'Dark high contrast' }).click()
  await expect(page.locator('.dg-canvas').first()).toHaveAttribute('data-theme', 'dark-high-contrast')
  await expect(page.locator('html')).toHaveAttribute('data-app-theme', 'dark-high-contrast')
})
