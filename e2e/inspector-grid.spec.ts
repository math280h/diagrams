import { expect, test } from './fixtures'
import { copyTemplate } from './helpers'

test('lines up the value controls of the properties panel on one left edge', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.locator('.dg-edge-label', { hasText: 'consume' }).click()
  const panel = page.getByRole('complementary', { name: 'Properties' })
  const lefts = await Promise.all(
    ['Label', 'Protocol', 'Path', 'Stroke', 'Start', 'End'].map(async (name) => {
      const value = panel.getByRole('group', { name, exact: true }).locator(':scope > div')
      return Math.round((await value.locator(':scope > *').first().boundingBox())!.x)
    }),
  )
  expect(new Set(lefts).size).toBe(1)
  await expect(panel.getByRole('combobox', { name: 'Protocol' })).toHaveAttribute('title', 'From the label (Messaging)')
})
