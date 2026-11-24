import { expect, test, type Locator, type Page } from './fixtures'
import { copyTemplate } from './helpers'

const TOP_BAR_HEIGHT_PX = 44

async function box(locator: Locator) {
  const found = await locator.boundingBox()
  expect(found).not.toBeNull()
  return found!
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

async function stepTo(page: Page, step: number, total: number) {
  await expect(async () => {
    const text = (await page.getByText(/^Step \d+ of \d+$/).textContent()) ?? ''
    const current = Number(/Step (\d+)/.exec(text)?.[1])
    if (current !== step) await page.keyboard.press(current < step ? 'ArrowRight' : 'ArrowLeft')
    await expect(page.getByText(`Step ${step} of ${total}`)).toBeVisible({ timeout: 500 })
  }).toPass()
}

test.use({ reducedMotion: 'reduce' })

test('shows a callout next to the node of the step in Present, clear of the node and of the top bar', async ({
  page,
}) => {
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.getByRole('button', { name: 'Flows' }).click()
  await page.getByRole('button', { name: 'Flow settings' }).click()
  await expect(page.getByRole('combobox', { name: 'Captions' })).toHaveAttribute('title', 'Callout')
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Present' }).click()
  await stepTo(page, 5, 13)
  const callout = page.locator('.dg-callout')
  await expect(callout).toContainText('Orders validates the cart.')
  await expect(callout).toHaveAttribute('data-side', /^(top|right|bottom|left)$/)
  await expect(page.locator('.dg-caption')).toHaveCount(0)
  const orders = page.locator('.react-flow__node', { hasText: 'Orders' }).first()
  await expect
    .poll(async () => {
      const [card, node] = [await box(callout), await box(orders)]
      return !overlaps(card, node) && card.y >= TOP_BAR_HEIGHT_PX && card.y + card.height <= 900
    })
    .toBe(true)
})

test('picks a caption style for a flow and another for one step, and Present shows each', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.getByRole('button', { name: 'Flows' }).click()
  await page.getByRole('button', { name: 'Flow settings' }).click()
  await page.getByRole('combobox', { name: 'Captions' }).click()
  await page.getByRole('option', { name: 'Subtitle' }).click()
  await expect(page.getByRole('combobox', { name: 'Captions' })).toHaveAttribute('title', 'Subtitle')
  await page.keyboard.press('Escape')

  await page.locator('.dg-log-row').nth(2).click()
  const style = page.getByRole('combobox', { name: 'Caption style' })
  await expect(style).toHaveAttribute('title', 'Same as the flow (Subtitle)')
  await style.click()
  await page.getByRole('option', { name: 'Top bar' }).click()
  await expect(style).toHaveAttribute('title', 'Top bar')

  await page.getByRole('button', { name: 'Present' }).click()
  await stepTo(page, 1, 13)
  await expect(page.locator('.dg-subtitle')).toHaveText('The shopper presses Pay.')
  await expect(page.locator('.dg-callout')).toHaveCount(0)

  await stepTo(page, 3, 13)
  const bar = page.locator('.dg-caption[data-place="top"]')
  await expect(bar).toContainText('The gateway checks the session and routes the request.')
  await expect(page.locator('.dg-subtitle')).toHaveCount(0)
  expect((await box(bar)).y).toBeCloseTo(TOP_BAR_HEIGHT_PX, 0)

  await page.getByRole('button', { name: /Exit presentation/ }).click()
  await expect(page).toHaveURL(/#\/d\//)
  if (!(await page.getByRole('region', { name: 'Flow' }).isVisible())) {
    await page.getByRole('button', { name: 'Flows' }).click()
  }
  await page.locator('.dg-log-row').nth(2).click()
  await page.getByRole('combobox', { name: 'Caption style' }).click()
  await page.getByRole('option', { name: 'Same as the flow (Subtitle)' }).click()
  await page.getByRole('button', { name: 'Flow settings' }).click()
  await page.getByRole('combobox', { name: 'Captions' }).click()
  await page.getByRole('option', { name: 'Hidden' }).click()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Present' }).click()
  await stepTo(page, 3, 13)
  await expect(page.locator('.dg-captions')).toBeAttached()
  await expect(page.locator('.dg-captions > *')).toHaveCount(0)
})
