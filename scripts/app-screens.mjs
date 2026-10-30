import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'
import { preview } from 'vite'

const root = path.join(import.meta.dirname, '..')
const [distArg = 'dist', outArg = '.app-screens', portArg = '4180'] = process.argv.slice(2)
const dist = path.resolve(distArg)
const out = path.resolve(outArg)
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 390, height: 844 }
const LAPTOP = { width: 1280, height: 720 }
const READY_MS = 30_000
const SETTLE_MS = 400
const STEADY_INTERVAL_MS = 150
const STEADY_TIMEOUT_MS = 10_000
const HIDE_TRAFFIC = '.dg-traffic { visibility: hidden !important; }'

async function capture(page, name, theme) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(SETTLE_MS)
  const shoot = () => page.screenshot({ animations: 'disabled', caret: 'hide', style: HIDE_TRAFFIC })
  const deadline = Date.now() + STEADY_TIMEOUT_MS
  let previous = await shoot()
  for (;;) {
    await page.waitForTimeout(STEADY_INTERVAL_MS)
    const next = await shoot()
    if (next.equals(previous) || Date.now() > deadline) {
      if (!next.equals(previous)) console.log(`::warning::The ${name}.${theme} screen kept changing.`)
      writeFileSync(path.join(out, `${name}.${theme}.png`), next)
      return
    }
    previous = next
  }
}

async function captureWholePage(page, name, theme) {
  const viewport = page.viewportSize()
  const hiddenPx = await page.locator('main').evaluate((element) => element.scrollHeight - element.clientHeight)
  await page.setViewportSize({ width: viewport.width, height: viewport.height + hiddenPx })
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('[class~="aspect-[16/10]"]')].every((frame) =>
        frame.querySelector('.dg-preview'),
      ) && [...document.querySelectorAll('.dg-preview > div')].every((canvas) => canvas.style.opacity === '1'),
    null,
    { timeout: READY_MS },
  )
  await capture(page, name, theme)
  await page.setViewportSize(viewport)
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
  await captureWholePage(page, 'library', theme)

  await page.goto(`${url}#/t/order-system`)
  await page.locator('.react-flow__node').first().waitFor({ timeout: READY_MS })
  await capture(page, 'template', theme)

  await copyOrderSystem(page, url)
  await capture(page, 'editor', theme)

  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('tab', { name: 'This diagram' }).waitFor()
  await capture(page, 'settings-diagram', theme)
  await page.getByRole('tab', { name: 'App' }).click()
  await capture(page, 'settings-app', theme)
  await page.keyboard.press('Escape')

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

async function laptopScreens(page, url, theme) {
  await copyOrderSystem(page, url)
  await page.locator('.react-flow__node', { hasText: 'Orders' }).first().click()
  await page.getByRole('button', { name: 'Flows' }).click()
  await page.getByRole('region', { name: 'Flow' }).waitFor()
  await capture(page, 'laptop-editor-panels', theme)
}

async function phoneScreens(page, url, theme) {
  await page.goto(`${url}#/`)
  await page.locator('.dg-preview .react-flow__node').first().waitFor({ timeout: READY_MS })
  await captureWholePage(page, 'phone-library', theme)

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
const origin = new URL(url).origin
const browser = await chromium.launch()
try {
  for (const theme of ['dark', 'light']) {
    for (const [size, take] of [
      [DESKTOP, desktopScreens],
      [LAPTOP, laptopScreens],
      [PHONE, phoneScreens],
    ]) {
      const context = await browser.newContext({
        viewport: size,
        deviceScaleFactor: 1,
        colorScheme: theme,
        reducedMotion: 'reduce',
      })
      await context.route(
        (address) => address.origin !== origin,
        (route) => route.abort(),
      )
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
