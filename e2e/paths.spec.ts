import { expect, test, type Page } from '@playwright/test'
import { copyTemplate } from './helpers'

function card(page: Page, title: string) {
  return page.locator('[data-editor-canvas] .react-flow__node', { hasText: title }).first()
}

test('plays a fan-out with a token for each target, and an alternate path', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Event pipeline')
  await page.getByRole('button', { name: 'Flows' }).click()

  const fanOut = page.getByRole('button', { name: /^Step 6: events\.raw → Enricher, Fraud scoring/ })
  await expect(fanOut).toBeVisible()
  await fanOut.click()
  await expect(page.locator('[data-editor-canvas] .dg-token-dot:visible')).toHaveCount(2)
  await expect(page.getByRole('button', { name: /^Step 7: Enricher, Fraud scoring/ })).toBeVisible()

  await page.getByRole('button', { name: 'Path', exact: true }).click()
  await page.getByRole('menuitemradio', { name: 'High fraud score' }).click()
  await expect(page.getByRole('button', { name: 'Path', exact: true })).toContainText('High fraud score')
  await expect(page.locator('[data-path]')).toHaveCount(2)
  await expect(page.getByRole('button', { name: /^Step 8: Fraud scoring → PagerDuty/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Warehouse/ })).toHaveCount(0)

  await page.getByRole('button', { name: 'Present' }).click()
  await expect(page.locator('.dg-caption')).toBeVisible()
  await page.keyboard.press('Space')
  await page.getByRole('button', { name: 'Path', exact: true }).click()
  await page.getByRole('menuitemradio', { name: 'High fraud score' }).click()
  for (let press = 0; press < 5; press++) await page.keyboard.press('ArrowRight')
  await expect(page.locator('.dg-caption')).toContainText('The on-call engineer gets the alert')
})

test('records a fan-out with Shift-click and a path after a step', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Event pipeline')
  await page.getByRole('button', { name: 'Flows' }).click()
  await page.getByRole('button', { name: 'An event arrives' }).click()
  await page.getByRole('menuitem', { name: 'New flow' }).click()
  await expect(page.getByRole('button', { name: 'Recording' })).toBeVisible()

  await card(page, 'events.raw').click()
  await card(page, 'Enricher').click()
  await card(page, 'Fraud scoring').click({ modifiers: ['Shift'] })
  await expect(page.getByRole('button', { name: /^Step 2: events\.raw → Enricher, Fraud scoring/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Step 3: Enricher, Fraud scoring/ })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: /^Step 3: / }).click()
  await page.getByRole('button', { name: 'Path', exact: true }).click()
  await page.getByRole('menuitem', { name: 'New path after step 3' }).click()
  await expect(page.getByRole('button', { name: 'Recording' })).toBeVisible()
  await card(page, 'Warehouse').click()
  await expect(page.locator('[data-path]')).toHaveCount(2)
  await expect(page.getByRole('button', { name: /^Step 5: Warehouse/ })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Path settings' }).click()
  await page.getByRole('dialog').getByRole('textbox').fill('Late load')
  await expect(page.getByRole('button', { name: 'Path', exact: true })).toContainText('Late load')
  await page.getByRole('button', { name: 'Delete path' }).click()
  await expect(page.getByRole('button', { name: 'Path', exact: true })).toContainText('Main path')
  await expect(page.locator('[data-path]')).toHaveCount(0)
})
