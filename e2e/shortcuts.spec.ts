import { expect, test } from './fixtures'
import { copyTemplate } from './helpers'

test('lists the shortcuts of the editor, flows and Present, and shows keys in tooltips', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.keyboard.press('?')
  const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  for (const heading of ['Editor', 'Flows', 'Present']) {
    await expect(sheet.getByRole('heading', { name: heading })).toBeVisible()
  }
  await expect(sheet.getByText('Leave Present')).toBeVisible()
  await expect(sheet.getByText('Stop recording')).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Command menu' }).hover()
  await expect(page.locator('[data-slot="tooltip-content"]')).toHaveText(/Command menu\s*(⌘K|Ctrl\+K)/)

  await page.getByRole('button', { name: 'Present' }).click()
  await page.locator('.dg-caption').waitFor()
  await page.getByRole('button', { name: 'Next step' }).hover()
  await expect(page.locator('[data-slot="tooltip-content"]')).toHaveText(/Next step\s*→/)
})
