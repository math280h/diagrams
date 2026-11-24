import { expect, test } from './fixtures'
import { copyTemplate } from './helpers'

test('says when a diagram has nothing to play', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'New diagram' }).first().click()
  await page.getByRole('button', { name: 'Present' }).click()
  await expect(page.getByText('This diagram is empty.')).toBeVisible()
})

test('changes the speed with the speed menu and with the < and > keys', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.getByRole('button', { name: 'Present' }).click()
  const speed = page.getByRole('button', { name: /^Speed / })
  await expect(speed).toHaveText('1×')

  await page.keyboard.press('>')
  await expect(speed).toHaveText('1.25×')
  await page.keyboard.press('<')
  await page.keyboard.press('<')
  await expect(speed).toHaveText('0.75×')

  await speed.click()
  await page.getByRole('menuitemradio', { name: '2×' }).click()
  await expect(speed).toHaveText('2×')
  await page.keyboard.press('>')
  await expect(speed).toHaveText('2×')
})

test('tells once that a dot marks a node with details', async ({ page }) => {
  const hint = page.getByText('A dot on a node means it has details.')
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.getByRole('button', { name: 'Present' }).click()
  await expect(hint).toBeVisible()
  await page.getByRole('button', { name: /Exit presentation/ }).click()
  await page.getByRole('button', { name: 'Present' }).click()
  await expect(page.locator('.dg-captions')).toBeVisible()
  await expect(hint).toHaveCount(0)
})
