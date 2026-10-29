import { expect, test, type Page } from '@playwright/test'
import { copyTemplate } from './helpers'

async function openFlows(page: Page) {
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.getByRole('button', { name: 'Flows' }).click()
  await expect(page.getByRole('region', { name: 'Flow' })).toBeVisible()
}

const rows = (page: Page) => page.locator('.dg-log-row')

test('adds an introduction and a conclusion, and records new steps before the conclusion', async ({ page }) => {
  await openFlows(page)
  const count = await rows(page).count()
  await page.getByRole('button', { name: 'Place an order' }).click()
  await page.getByRole('menuitem', { name: 'Add an introduction' }).click()
  await page.getByRole('button', { name: 'Place an order' }).click()
  await page.getByRole('menuitem', { name: 'Add a conclusion' }).click()
  await expect(rows(page)).toHaveCount(count + 2)
  await expect(rows(page).first()).toContainText('Introduction')
  await expect(rows(page).last()).toContainText('Conclusion')
  await expect(page.getByRole('complementary', { name: 'Properties' })).toContainText(
    'Shows the whole path of the flow.',
  )

  await page.getByRole('button', { name: 'Record' }).click()
  await page.locator('.react-flow__node', { hasText: 'Redis' }).first().click()
  await expect(rows(page).last()).toContainText('Conclusion')
  await expect(rows(page).nth(-2)).toContainText('Redis')

  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Present' }).click()
  await expect(page.locator('.dg-caption-element')).toHaveText('Introduction')
  await expect(page.locator('.react-flow__node[data-flow="active"]').first()).toBeVisible()
})

test('numbers the previous, the current and the next step on the diagram', async ({ page }) => {
  await openFlows(page)
  await page.getByRole('button', { name: 'Flow settings' }).click()
  await page.getByRole('switch', { name: 'Number the steps on the diagram' }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Next step' }).click()
  await page.getByRole('button', { name: 'Next step' }).click()
  await expect(page.locator('.dg-step-number')).toHaveText(['2', '3', '4'])
  await expect(page.locator('.dg-step-number[data-current]')).toHaveText('3')
})

test('changes the time of a step on the timeline, with or without moving the later steps', async ({ page }) => {
  await openFlows(page)
  const offsets = async () => (await rows(page).locator('span:nth-child(2)').allTextContents()).slice(0, 3)
  const before = await offsets()
  await page.getByRole('button', { name: 'Timeline', exact: true }).click()
  const end = page.getByRole('separator', { name: /^End of step 1\./ })
  await end.focus()
  await end.press('ArrowRight')
  await page.getByRole('button', { name: 'Log', exact: true }).click()
  const rippled = await offsets()
  expect(rippled[1]).not.toBe(before[1])
  expect(rippled[2]).not.toBe(before[2])

  await page.getByRole('button', { name: 'Timeline', exact: true }).click()
  await page.getByRole('separator', { name: /^End of step 1\./ }).focus()
  await page.keyboard.press('Alt+ArrowRight')
  await page.getByRole('button', { name: 'Log', exact: true }).click()
  const local = await offsets()
  expect(local[1]).not.toBe(rippled[1])
  expect(local[2]).toBe(rippled[2])
})
