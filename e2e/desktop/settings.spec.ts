import { readFileSync } from 'node:fs'
import path from 'node:path'
import { BUILD } from '@/desktop/build-config'
import { copyTemplate } from '../helpers'
import { expect, test } from './fixtures'

const COMPANY = 'https://diagrams.example.com'

function storedSettings(userData: string) {
  return JSON.parse(readFileSync(path.join(userData, 'app-settings.json'), 'utf8')) as {
    websites: string[]
    shareWebsite: string | null
  }
}

test('adds a website, opens share links on it, and keeps at least one website', async ({ window, dirs }) => {
  await window.getByRole('banner').getByRole('button', { name: 'App settings' }).click()
  const dialog = window.getByRole('dialog', { name: 'App settings' })
  const websites = dialog.getByRole('list', { name: 'Websites' })
  await expect(websites.getByRole('listitem')).toHaveText([BUILD.website])
  await expect(dialog.getByRole('button', { name: `Remove ${BUILD.website}` })).toBeDisabled()
  await expect(dialog).toContainText('This build does not update itself.')

  const address = dialog.getByRole('textbox', { name: 'Website address' })
  const add = dialog.getByRole('button', { name: 'Add', exact: true })
  await address.fill('http://diagrams.example.com')
  await add.click()
  await expect(dialog).toContainText('Enter a website address that starts with https://')
  await address.fill('diagrams.example.com/#/d/one')
  await add.click()
  await expect(websites.getByRole('listitem')).toHaveText([BUILD.website, COMPANY])
  await expect(address).toHaveValue('')

  await dialog.getByRole('combobox', { name: 'Share links open on' }).click()
  await window.getByRole('option', { name: COMPANY }).click()
  await expect
    .poll(() => storedSettings(dirs.userData))
    .toMatchObject({
      websites: [BUILD.website, COMPANY],
      shareWebsite: COMPANY,
    })
  await window.keyboard.press('Escape')

  await copyTemplate(window, 'Checkout flow')
  await window.getByRole('button', { name: 'Export' }).click()
  await window.getByRole('menuitem', { name: 'Share link' }).click()
  await expect(window.getByRole('textbox', { name: 'Share link' })).toHaveValue(
    /^https:\/\/diagrams\.example\.com\/#\/s\/y[\w-]+x$/,
    { timeout: 15_000 },
  )
  await window.keyboard.press('Escape')

  await window.getByRole('button', { name: 'Settings', exact: true }).click()
  await window.getByRole('tab', { name: 'App', exact: true }).click()
  await window.getByRole('button', { name: 'Websites and updates' }).click()
  await dialog.getByRole('button', { name: `Remove ${COMPANY}` }).click()
  await expect(websites.getByRole('listitem')).toHaveText([BUILD.website])
  await expect.poll(() => storedSettings(dirs.userData).websites).toEqual([BUILD.website])
})
