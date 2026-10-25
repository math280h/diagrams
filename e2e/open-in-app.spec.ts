import { expect, test } from '@playwright/test'
import { AGENT_HOST, AGENT_PORT, DESKTOP_DOWNLOAD_URL } from '@/desktop/constants'
import { copyTemplate } from './helpers'

test('explains what to do when the desktop app does not answer', async ({ page }) => {
  await page.clock.install()
  await page.route(`http://${AGENT_HOST}:${AGENT_PORT}/**`, (route) => route.abort('connectionrefused'))
  await page.addInitScript(() => {
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (!this.href.startsWith('diagrams:')) HTMLElement.prototype.click.call(this)
    }
  })
  await page.goto('/')
  await copyTemplate(page, 'Event pipeline')
  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: 'Open in desktop app' }).click()
  await expect(page.getByText('Opening in Diagrams…')).toBeVisible()

  await page.clock.runFor(16_000)
  await expect(page.getByText('Could not open the app')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Get the desktop app' })).toHaveAttribute('href', DESKTOP_DOWNLOAD_URL)
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
})
