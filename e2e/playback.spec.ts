import { expect, test } from '@playwright/test'
import { copyTemplate } from './helpers'

test('plays a flow as log lines with a token and a spotlight', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Checkout flow')
  await page.getByRole('button', { name: 'Flows' }).click()
  await page.getByRole('button', { name: 'Play' }).click()
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()

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
  await expect(page.getByRole('button', { name: 'Pause' })).toBeAttached()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Play' })).toBeAttached()
  for (let press = 0; press < 4; press++) await page.keyboard.press('ArrowRight')
  await expect(page.locator('.dg-caption')).toContainText('The cart shows two items.')
  await expect(page.getByText('Step 5 of 11')).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('.dg-caption')).toContainText('POST /cart/items')
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

test('names the way back from a template on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/t/checkout-flow')
  await page.getByRole('button', { name: 'All diagrams' }).click()
  await expect(page).toHaveURL(/#\/$/)
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

test('hides an edge label while the token passes over it', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.getByRole('button', { name: 'Present' }).click()
  const covered = page.locator('.dg-edge-label[data-covered]')
  await expect(covered.first()).toBeAttached({ timeout: 10_000 })
  await expect(covered).toHaveCount(0, { timeout: 10_000 })
})

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('hides the edge label under the token after a jump to a step', async ({ page }) => {
    await page.goto('/')
    await copyTemplate(page, 'Order system')
    await page.getByRole('button', { name: 'Present' }).click()
    await expect(page.locator('.dg-caption')).toBeVisible()
    for (let press = 0; press < 5; press++) await page.keyboard.press('ArrowRight')
    await expect(page.getByText('Step 6 of 13')).toBeVisible()

    const labelsAtToken = () =>
      page.evaluate(() => {
        const chip = document.querySelector('.dg-token-chip')!.getBoundingClientRect()
        const labels = Array.from(document.querySelectorAll('.dg-edge-label'))
        const under = (label: Element) => {
          const box = label.getBoundingClientRect()
          return box.left < chip.right && box.right > chip.left && box.top < chip.bottom && box.bottom > chip.top
        }
        return {
          covered: labels.filter((label) => label.hasAttribute('data-covered')).map((label) => label.textContent),
          underToken: labels.filter(under).map((label) => label.textContent),
        }
      })
    await expect
      .poll(async () => {
        const { covered, underToken } = await labelsAtToken()
        return underToken.length > 0 && covered.join('\n') === underToken.join('\n')
      })
      .toBe(true)
  })
})

test('keeps the icon of a node that appears while the canvas is zoomed out readable', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New diagram' }).first().click()
  await expect(page.getByLabel('Diagram name')).toHaveValue('Untitled diagram')
  const zoom = page.getByRole('button', { name: 'Reset zoom to 100%' })
  const percent = async () => Number.parseInt((await zoom.textContent()) ?? '100', 10)
  while ((await percent()) > 50) {
    const before = await zoom.textContent()
    await page.getByRole('button', { name: 'Zoom out' }).click()
    await expect(zoom).not.toHaveText(before ?? '')
  }

  await page.keyboard.press('n')
  await page.getByPlaceholder('Insert a node').fill('lambda')
  await page.getByRole('option', { name: /AWS Lambda/ }).click()
  const icon = page.locator('[data-editor-canvas] .react-flow__node .dg-card-icon').first()
  await expect.poll(async () => (await icon.boundingBox())?.width ?? 0).toBeGreaterThan(9)
})
