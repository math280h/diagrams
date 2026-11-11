import { expect, test, type Page } from './fixtures'
import { copyTemplate } from './helpers'

function logRow(page: Page, step: number) {
  return page.locator('.dg-log-row').nth(step - 1)
}

function card(page: Page, title: string) {
  return page.locator('[data-editor-canvas] .react-flow__node', { hasText: title }).first()
}

async function clickEdge(page: Page, name: string) {
  const path = page.locator(`[data-editor-canvas] [aria-label="${name}"] .dg-edge-path`)
  const point = await path.evaluate((element: SVGPathElement) => {
    const matrix = element.getScreenCTM()!
    const middle = element.getPointAtLength(element.getTotalLength() / 2)
    return {
      x: matrix.a * middle.x + matrix.c * middle.y + matrix.e,
      y: matrix.b * middle.x + matrix.d * middle.y + matrix.f,
    }
  })
  await page.mouse.click(point.x, point.y)
}

test('plays a fan-out with a token for each target, and an alternate path', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Event pipeline')
  await page.getByRole('button', { name: 'Flows' }).click()

  const fanOut = logRow(page, 6)
  await expect(fanOut).toContainText('events.raw → Enricher, Fraud scoring')
  await fanOut.click()
  await expect(page.locator('[data-editor-canvas] .dg-token-dot:visible')).toHaveCount(2)
  await expect(logRow(page, 7)).toContainText('Enricher, Fraud scoring')

  await page.getByRole('button', { name: /^Path: / }).click()
  await page.getByRole('menuitemradio', { name: 'High fraud score' }).click()
  await expect(page.getByRole('button', { name: /^Path: / })).toContainText('High fraud score')
  await expect(page.locator('[data-path]')).toHaveCount(2)
  await expect(logRow(page, 8)).toContainText('Fraud scoring → PagerDuty')
  await expect(page.getByRole('button', { name: /Warehouse/ })).toHaveCount(0)

  await page.getByRole('button', { name: 'Present' }).click()
  await expect(page.locator('.dg-caption')).toBeVisible()
  await page.keyboard.press('Space')
  await page.getByRole('button', { name: /^Path: / }).click()
  await page.getByRole('menuitemradio', { name: 'High fraud score' }).click()
  for (let press = 0; press < 8; press++) await page.keyboard.press('ArrowRight')
  await expect(page.locator('.dg-caption')).toContainText('The on-call engineer gets the alert')
})

test('records the replies of a fan-out at the same time, and turns one off', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Event pipeline')
  await page.getByRole('button', { name: 'Flows' }).click()
  await page.getByRole('button', { name: 'An event arrives' }).click()
  await page.getByRole('menuitem', { name: 'New flow' }).click()
  await expect(page.getByRole('button', { name: 'Recording' })).toBeVisible()

  await card(page, 'events.raw').click()
  await card(page, 'Enricher').click()
  await card(page, 'Fraud scoring').click({ modifiers: ['Shift'] })
  await card(page, 'events.raw').click()
  await expect(logRow(page, 4)).toContainText('Enricher, Fraud scoring → events.raw')
  await expect(logRow(page, 5)).toContainText('events.raw')
  await page.keyboard.press('Escape')

  await logRow(page, 4).click()
  await expect(page.locator('[data-editor-canvas] .dg-token-dot:visible')).toHaveCount(2)
  const reply = page.getByRole('switch', { name: 'Fraud scoring → events.raw' })
  await expect(reply).toBeChecked()
  await reply.click()
  await expect(logRow(page, 4)).toContainText('Enricher → events.raw')
  await expect(page.getByRole('switch', { name: 'Fraud scoring → events.raw' })).not.toBeChecked()
})

test('records a call with no reply in a fan-out, and a side path that plays at the same time', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Event pipeline')
  await clickEdge(page, 'events.raw to Fraud scoring')
  const properties = page.getByRole('complementary', { name: 'Properties' })
  await expect(properties.getByRole('heading', { name: 'Response body', exact: true })).toBeVisible()
  await properties.getByRole('switch', { name: 'No reply' }).click()
  await expect(properties.getByRole('heading', { name: 'Response body', exact: true })).toHaveCount(0)
  await page.locator('[data-editor-canvas] .react-flow__pane').click({ position: { x: 8, y: 8 } })
  await expect(properties).toHaveCount(0)

  await page.getByRole('button', { name: 'Flows' }).click()
  await page.getByRole('button', { name: 'An event arrives' }).click()
  await page.getByRole('menuitem', { name: 'New flow' }).click()
  await expect(page.getByRole('button', { name: 'Recording' })).toBeVisible()
  await card(page, 'events.raw').click()
  await card(page, 'Enricher').click()
  await card(page, 'Fraud scoring').click({ modifiers: ['Shift'] })
  await card(page, 'events.raw').click()
  await expect(logRow(page, 4)).toContainText('Enricher → events.raw')
  await expect(logRow(page, 4)).not.toContainText('Fraud scoring')
  await page.keyboard.press('Escape')

  await logRow(page, 3).click()
  await page.getByRole('button', { name: /^Path: / }).click()
  await page.getByRole('menuitem', { name: 'New side path after step 3' }).click()
  await expect(page.getByRole('button', { name: 'Recording' })).toBeVisible()
  await expect(page.getByText('Click the nodes that the side path “Side path 1” reaches')).toBeVisible()
  await card(page, 'PagerDuty').click()
  await page.keyboard.press('Escape')

  const rows = page.locator('.dg-log-row')
  await expect(rows.locator('> span:first-child')).toHaveText(['1', '2', '3', '3.1', '4', '3.2', '5'])
  await expect(logRow(page, 4)).toContainText('Fraud scoring → PagerDuty')
  await expect(page.locator('.dg-log-row[data-side]')).toHaveCount(2)

  await logRow(page, 5).click()
  await expect(page.locator('[data-editor-canvas] .dg-token-dot:visible')).toHaveCount(2)
  await expect(page.locator('.dg-log-row[data-state="active"]')).toHaveText([/3\.1/, /^4/])
  await expect(page.getByRole('button', { name: /^Path: / })).toContainText('Side path 1')

  await page.getByRole('button', { name: 'Present' }).click()
  await page.getByRole('button', { name: 'An event arrives' }).click()
  await page.getByRole('menuitemradio', { name: /^Flow \d+$/ }).click()
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Path: / })).toHaveCount(0)
  await expect(async () => {
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('.dg-caption-step')).toHaveText('4/5', { timeout: 500 })
  }).toPass()
  await expect(page.locator('.dg-caption-side')).toContainText('3.1 Side path 1: Fraud scoring → PagerDuty')
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
  await expect(logRow(page, 2)).toContainText('events.raw → Enricher, Fraud scoring')
  await expect(logRow(page, 3)).toContainText('Enricher, Fraud scoring')
  await page.keyboard.press('Escape')

  await logRow(page, 3).click()
  await page.getByRole('button', { name: /^Path: / }).click()
  await page.getByRole('menuitem', { name: 'New path after step 3' }).click()
  await expect(page.getByRole('button', { name: 'Recording' })).toBeVisible()
  await card(page, 'Warehouse').click()
  await expect(page.locator('[data-path]')).toHaveCount(2)
  await expect(logRow(page, 5)).toContainText('Warehouse')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Path settings' }).click()
  await page.getByRole('dialog').getByRole('textbox').fill('Late load')
  await expect(page.getByRole('button', { name: /^Path: / })).toContainText('Late load')
  await page.getByRole('button', { name: 'Delete path' }).click()
  await expect(page.getByRole('button', { name: /^Path: / })).toContainText('Main path')
  await expect(page.locator('[data-path]')).toHaveCount(0)
})
