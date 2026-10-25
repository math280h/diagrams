import { expect, test, type Page } from '@playwright/test'
import {
  AGENT_HOST,
  AGENT_PORT,
  DESKTOP_DOWNLOAD_URL,
  LATEST_RELEASE_API_URL,
  RELEASE_ASSET_URL_PREFIX,
} from '@/desktop/constants'
import { copyTemplate } from './helpers'

const RELEASE_ASSETS = [
  'Diagrams-9.9.9-win-x64.exe',
  'Diagrams-9.9.9-mac-arm64.dmg',
  'Diagrams-9.9.9-mac-x64.dmg',
  'Diagrams-9.9.9-linux-x86_64.AppImage',
].map((name) => ({ name, browser_download_url: `${RELEASE_ASSET_URL_PREFIX}v9.9.9/${name}` }))

async function serveLatestRelease(page: Page) {
  await page.route(LATEST_RELEASE_API_URL, (route) =>
    route.fulfill({ json: { assets: RELEASE_ASSETS }, headers: { 'access-control-allow-origin': '*' } }),
  )
}

test('downloads the installer of the latest release for this system', async ({ page }) => {
  await serveLatestRelease(page)
  await page.goto('/')
  const download = page.getByRole('link', { name: /^Download for (Windows|macOS|Linux)$/ })
  await expect(download).toHaveAttribute(
    'href',
    /\/releases\/download\/v9\.9\.9\/Diagrams-9\.9\.9-.+\.(exe|dmg|AppImage)$/,
  )
  await expect(download).not.toHaveAttribute('target')
  await expect(page.getByRole('link', { name: 'All downloads' })).toHaveAttribute('href', DESKTOP_DOWNLOAD_URL)
})

test('explains what to do when the desktop app does not answer', async ({ page }) => {
  await page.clock.install()
  await page.route(LATEST_RELEASE_API_URL, (route) => route.abort('connectionrefused'))
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
