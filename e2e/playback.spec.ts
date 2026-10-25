import { expect, test } from '@playwright/test'
import { copyTemplate } from './helpers'

test('plays a flow as log lines with a token and a spotlight', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Checkout flow')
  await page.getByRole('button', { name: 'Flows' }).click()
  await page.getByRole('button', { name: 'Play' }).click()

  const activeLine = page.locator('[aria-current="step"]')
  await expect(activeLine).toContainText('A returning customer')
  await expect(page.locator('.dg-token-dot')).toBeVisible()
  await expect(page.locator('.react-flow__node[data-flow="idle"]').first()).toBeAttached()
  await expect(activeLine).toContainText('product page', { timeout: 8000 })
  await expect(page.locator('[data-state="done"]').first()).toBeAttached()
})

test('opens the player and steps with the keyboard', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Checkout flow')
  await page.getByRole('button', { name: 'Present' }).click()
  await expect(page).toHaveURL(/#\/p\//)
  await expect(page.locator('.dg-caption')).toBeVisible()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.dg-caption')).toContainText('cart')
  await page.getByRole('button', { name: /Exit presentation/ }).click()
  await expect(page).toHaveURL(/#\/d\//)
})

test('previews a template without copying it, then copies it on request', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /Checkout flow/ }).click()
  await expect(page).toHaveURL(/#\/t\/checkout-flow/)
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
  expect(
    await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('dg:diagram:')).length),
  ).toBe(0)

  await page.getByRole('button', { name: 'Play Returning customer' }).click()
  await expect(page.locator('.dg-caption')).toContainText('A returning customer')

  await page.getByRole('button', { name: 'Use this template' }).click()
  await expect(page).toHaveURL(/#\/d\//)
  expect(
    await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('dg:diagram:')).length),
  ).toBe(1)
})

test('draws edges with fixed sides on a read-only canvas', async ({ page }) => {
  await page.goto('/#/t/multi-cloud')
  const risk = page.locator('.react-flow__node', { hasText: 'Risk client' }).first()
  const fraud = page.locator('.react-flow__node', { hasText: 'Fraud model' }).first()
  const label = page.locator('.dg-edge-label', { hasText: 'Interconnect' })
  await expect(label).toBeVisible()
  await expect
    .poll(async () => {
      const [from, to, middle] = await Promise.all([risk.boundingBox(), fraud.boundingBox(), label.boundingBox()])
      return middle!.x > from!.x + from!.width && middle!.x + middle!.width < to!.x
    })
    .toBe(true)
})

test('keeps icons readable when the canvas zooms out', async ({ page }) => {
  await page.goto('/#/t/multi-cloud')
  const card = page.locator('.react-flow__node', { hasText: 'HTTP router' }).first()
  const icon = card.locator('.dg-card-icon')
  const iconWidth = async () => (await icon.boundingBox())?.width ?? 0
  const cardAspect = () => card.evaluate((node: HTMLElement) => node.offsetHeight / node.offsetWidth)

  await expect.poll(iconWidth).toBeGreaterThan(9)
  const zoomedOutAspect = await cardAspect()
  await page.getByRole('button', { name: 'Reset zoom to 100%' }).click()
  await expect.poll(iconWidth).toBeCloseTo(14, 0)
  expect(await cardAspect()).toBe(zoomedOutAspect)
})
