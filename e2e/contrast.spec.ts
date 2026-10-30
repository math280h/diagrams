import { expect, test } from '@playwright/test'
import { copyTemplate } from './helpers'

test('follows the system contrast, keeps a choice after a reload, and exports the standard colours', async ({
  page,
}) => {
  await page.emulateMedia({ contrast: 'more' })
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  const canvas = page.locator('[data-editor-canvas] .dg-canvas')
  await expect(canvas).toHaveAttribute('data-contrast', 'more')
  const card = page.locator('[data-editor-canvas] .dg-card').first()
  const highOutline = await card.evaluate((element) => getComputedStyle(element).borderTopColor)

  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('tab', { name: 'App' }).click()
  const contrast = page.getByRole('group', { name: 'Canvas contrast' })
  await contrast.getByRole('button', { name: 'Standard' }).click()
  await expect(canvas).not.toHaveAttribute('data-contrast')
  await expect.poll(() => card.evaluate((element) => getComputedStyle(element).borderTopColor)).not.toBe(highOutline)

  await page.emulateMedia({ contrast: 'no-preference' })
  await contrast.getByRole('button', { name: 'High' }).click()
  await expect(canvas).toHaveAttribute('data-contrast', 'more')
  await page.reload()
  await expect(canvas).toHaveAttribute('data-contrast', 'more')

  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: /^Image/ }).click()
  const stage = page.locator('.dg-canvas[data-export]')
  await expect(stage).toHaveCount(1)
  await expect(stage).not.toHaveAttribute('data-contrast')
})

test('turns on high contrast from the theme menu in the library', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /^Theme:/ }).click()
  const item = page.getByRole('menuitemcheckbox', { name: 'High contrast canvas' })
  await expect(item).toHaveAttribute('aria-checked', 'false')
  await item.click()
  await expect(page.locator('.dg-canvas').first()).toHaveAttribute('data-contrast', 'more')
})
