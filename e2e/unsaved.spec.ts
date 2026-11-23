import { expect, test } from './fixtures'
import { copyTemplate } from './helpers'

test('shows a save that fails, asks before the editor closes, and saves again when storage has space', async ({
  page,
}) => {
  await page.goto('/')
  await copyTemplate(page, 'Order system')
  await page.evaluate(() => {
    const setItem = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem')!.value as Storage['setItem']
    const state = window as unknown as { storageFull: boolean }
    state.storageFull = true
    Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
      if (state.storageFull && key.startsWith('dg:diagram:')) {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      }
      Reflect.apply(setItem, this, [key, value])
    }
  })
  await page.getByLabel('Diagram name').fill('Changed while the storage is full')
  await page.getByLabel('Diagram name').press('Enter')
  const notSaved = page.getByRole('button', { name: 'Not saved' })
  await expect(notSaved).toBeVisible()

  await page.getByRole('link', { name: 'All diagrams' }).click()
  const question = page.getByRole('dialog', { name: 'Leave without saving?' })
  await expect(question).toBeVisible()
  await question.getByRole('button', { name: 'Stay' }).click()
  await expect(question).toBeHidden()
  await expect(page).toHaveURL(/#\/d\//)

  const unload = page.waitForEvent('dialog')
  void page.close({ runBeforeUnload: true })
  const leave = await unload
  expect(leave.type()).toBe('beforeunload')
  await leave.dismiss()
  await expect(notSaved).toBeVisible()

  await page.evaluate(() => void Object.assign(window, { storageFull: false }))
  await notSaved.click()
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(notSaved).toBeHidden()
  await page.getByRole('link', { name: 'All diagrams' }).click()
  await expect(page.getByText('Changed while the storage is full')).toBeVisible()
})
