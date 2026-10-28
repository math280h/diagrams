import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'
import { preview } from 'vite'

const root = path.join(import.meta.dirname, '..')
const [distArg = 'dist', outArg = '.app-screens', portArg = '4180'] = process.argv.slice(2)
const dist = path.resolve(distArg)
const out = path.resolve(outArg)
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }
const READY_MS = 30_000
const SETTLE_MS = 400

async function capture(page, name, theme) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(SETTLE_MS)
  await page.screenshot({ path: path.join(out, `${name}.${theme}.png`), animations: 'disabled', caret: 'hide' })
}

async function copyOrderSystem(page, url) {
  await page.goto(`${url}#/`)
  await page
    .getByRole('link', { name: /Order system/ })
    .last()
    .click()
  await page.getByRole('button', { name: 'Use this template' }).click()
  await page.locator('[data-editor-canvas] .react-flow__node').first().waitFor({ timeout: READY_MS })
}

async function desktopScreens(page, url, theme) {
  await page.goto(`${url}#/`)
  await page.locator('.dg-preview .react-flow__node').first().waitFor({ timeout: READY_MS })
  await capture(page, 'library', theme)

  await page.goto(`${url}#/t/order-system`)
  await page.locator('.react-flow__node').first().waitFor({ timeout: READY_MS })
  await capture(page, 'template', theme)

  await copyOrderSystem(page, url)
  await capture(page, 'editor', theme)

  await page.locator('.react-flow__node', { hasText: 'Postgres' }).first().click()
  await capture(page, 'editor-node', theme)

  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Flows' }).click()
  await page.getByRole('region', { name: 'Flow' }).waitFor()
  await capture(page, 'editor-flow', theme)

  await page.getByRole('button', { name: 'Export' }).click()
  await page.getByRole('menuitem', { name: /^Image/ }).click()
  await page.getByAltText('Export preview').waitFor({ timeout: READY_MS })
  await capture(page, 'export-image', theme)
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Present' }).click()
  await page.locator('.dg-caption').waitFor({ timeout: READY_MS })
  await capture(page, 'present', theme)
  for (let press = 0; press < 5; press++) await page.keyboard.press('ArrowRight')
  await capture(page, 'present-step', theme)

  await page.goto(`${url}#/`)
  await page.getByRole('button', { name: 'New diagram' }).first().click()
  await page.getByText('Start with a node').waitFor({ timeout: READY_MS })
  await capture(page, 'editor-empty', theme)
}

async function phoneScreens(page, url, theme) {
  await page.goto(`${url}#/`)
  await page.locator('.dg-preview .react-flow__node').first().waitFor({ timeout: READY_MS })
  await capture(page, 'phone-library', theme)

  await copyOrderSystem(page, url)
  await capture(page, 'phone-editor', theme)

  await page.getByRole('button', { name: 'Present' }).click()
  await page.locator('.dg-caption').waitFor({ timeout: READY_MS })
  await capture(page, 'phone-present', theme)
}

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
const server = await preview({
  root,
  configFile: false,
  logLevel: 'error',
  build: { outDir: dist },
  preview: { host: '127.0.0.1', port: Number(portArg), strictPort: true },
})
const url = server.resolvedUrls.local[0]
const browser = await chromium.launch()
try {
  for (const theme of ['dark', 'light']) {
    for (const [size, take] of [
      [DESKTOP, desktopScreens],
      [PHONE, phoneScreens],
    ]) {
      const context = await browser.newContext({
        viewport: size,
        deviceScaleFactor: 1,
        colorScheme: theme,
        reducedMotion: 'reduce',
      })
      const page = await context.newPage()
      await take(page, url, theme)
      await context.close()
    }
  }
} finally {
  await browser.close()
  await server.close()
}
console.log(`Wrote the app screens to ${path.relative(process.cwd(), out) || '.'}.`)
