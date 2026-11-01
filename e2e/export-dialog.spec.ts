import { expect, test, type Page } from './fixtures'
import { copyTemplate } from './helpers'

const TABS = ['Image', 'Animation', 'README', 'Web page', 'Share link', 'Mermaid', 'Description']

async function openExport(page: Page) {
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: /^Image/ }).click()
}

test('keeps the tab bar in place and the tabs in the order of the Export menu', async ({ page }) => {
  await openExport(page)
  await expect(page.getByRole('tab')).toHaveText(TABS)
  const tabs = page.getByRole('tablist')
  const top = (await tabs.boundingBox())!.y
  for (const name of TABS) {
    await page.getByRole('tab', { name }).click()
    expect((await tabs.boundingBox())!.y).toBe(top)
  }
})

test('fits the export dialog on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openExport(page)
  const dialog = page.getByRole('dialog')
  for (const name of ['Image', 'Animation', 'Description']) {
    await page.getByRole('tab', { name }).click()
    const box = (await dialog.boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height).toBeLessThanOrEqual(844)
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  }
})
