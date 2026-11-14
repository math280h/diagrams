import { BUG_REPORT_URL } from '@/desktop/constants'
import { expect, test } from './fixtures'
import { copyTemplate } from './helpers'

const STORAGE_FULL = 'Browser storage is full, so changes stay in this tab only.'

test('explains a failed save with the details for a bug report', async ({ page }) => {
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.evaluate(() => {
    const setItem = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem')!.value as Storage['setItem']
    Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
      if (key.startsWith('dg:diagram:')) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      Reflect.apply(setItem, this, [key, value])
    }
  })
  await page.getByLabel('Diagram name').fill('Changed while the storage is full')
  await page.getByLabel('Diagram name').press('Enter')

  await expect(page.getByText(STORAGE_FULL)).toBeVisible()
  await page.getByRole('button', { name: 'More details' }).click()
  const problem = page.getByRole('dialog', { name: STORAGE_FULL })
  const details = problem.locator('code')
  await expect(details).toContainText(/^Diagrams website at 127\.0\.0\.1:\d+, Mozilla\//)
  await expect(details).toContainText('The browser storage is full.')
  await expect(details).toContainText('Storage: browser')
  await expect(details).toContainText('Save failure: quota')
  await expect(problem.getByRole('link', { name: 'Open an issue on GitHub' })).toHaveAttribute('href', BUG_REPORT_URL)
  await page.keyboard.press('Escape')
  await expect(problem).toBeHidden()
})
