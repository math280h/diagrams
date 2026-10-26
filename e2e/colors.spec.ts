import { expect, test, type Page } from '@playwright/test'
import { copyTemplate } from './helpers'

function card(page: Page, title: string) {
  return page.locator('[data-editor-canvas] .react-flow__node', { hasText: title }).first().locator('.dg-card')
}

test('colours one node and then several nodes in one step, and keeps the colours after a reload', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  const properties = page.getByRole('complementary', { name: 'Properties' })

  await card(page, 'Auth').click()
  await properties.getByRole('button', { name: 'Teal', exact: true }).click()
  await expect(card(page, 'Auth')).toHaveAttribute('data-color', 'teal')
  await expect(properties.getByRole('button', { name: 'Teal', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const neutralBorder = await card(page, 'Orders').evaluate((element) => getComputedStyle(element).borderTopColor)
  expect(await card(page, 'Auth').evaluate((element) => getComputedStyle(element).borderTopColor)).not.toBe(
    neutralBorder,
  )

  await card(page, 'Postgres').click()
  await card(page, 'Redis').click({ modifiers: ['Shift'] })
  await card(page, 'Auth').click({ modifiers: ['Shift'] })
  const colour = properties.locator('section', { has: page.getByRole('heading', { name: 'Colour', exact: true }) })
  await expect(colour.getByRole('button', { name: 'Orange', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await colour.getByRole('button', { name: 'Orange', exact: true }).click()
  for (const title of ['Postgres', 'Redis', 'Auth'])
    await expect(card(page, title)).toHaveAttribute('data-color', 'orange')
  await expect(colour.getByRole('button', { name: 'Orange', exact: true })).toHaveAttribute('aria-pressed', 'true')

  await page.keyboard.press('ControlOrMeta+z')
  await expect(card(page, 'Auth')).toHaveAttribute('data-color', 'teal')
  await expect(card(page, 'Postgres')).not.toHaveAttribute('data-color')
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(card(page, 'Redis')).toHaveAttribute('data-color', 'orange')

  await page.reload()
  await expect(card(page, 'Redis')).toHaveAttribute('data-color', 'orange')
  await expect(card(page, 'Orders')).not.toHaveAttribute('data-color')
})

test('colours the selection from the context menu', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await card(page, 'Orders').click()
  await card(page, 'Email worker').click({ modifiers: ['Shift'] })
  await card(page, 'Email worker').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Colour' }).hover()
  await expect(page.getByRole('menuitemradio', { name: 'Neutral' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('menuitemradio', { name: 'Green' }).click()
  await expect(card(page, 'Orders')).toHaveAttribute('data-color', 'green')
  await expect(card(page, 'Email worker')).toHaveAttribute('data-color', 'green')
  await expect(card(page, 'Auth')).not.toHaveAttribute('data-color')
})
