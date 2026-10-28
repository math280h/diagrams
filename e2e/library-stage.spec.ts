import { expect, test } from '@playwright/test'

test('pauses and plays the template on the first-run stage', async ({ page }) => {
  await page.goto('/')
  const caption = page.locator('.dg-caption').first()
  await expect(caption).not.toHaveText('', { timeout: 10_000 })
  const pause = page.getByRole('button', { name: 'Pause', exact: true })
  await pause.click()
  const held = await caption.textContent()
  await page.waitForTimeout(2500)
  await expect(caption).toHaveText(held!)

  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(caption).not.toHaveText(held!, { timeout: 6000 })
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
})

test('waits for Play on the first-run stage when the user asks for reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.locator('.dg-caption').first()).not.toHaveText('', { timeout: 10_000 })
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
})

test('holds the playing template while the tab is in the background', async ({ page }) => {
  const setHidden = (hidden: boolean) =>
    page.evaluate((value) => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => (value ? 'hidden' : 'visible'),
      })
      document.dispatchEvent(new Event('visibilitychange'))
    }, hidden)
  await page.goto('/')
  const caption = page.locator('.dg-caption').first()
  await expect(caption).not.toHaveText('', { timeout: 10_000 })
  await setHidden(true)
  const held = await caption.textContent()
  await page.waitForTimeout(2500)
  await expect(caption).toHaveText(held!)
  await setHidden(false)
  await expect(caption).not.toHaveText(held!, { timeout: 6000 })
})
