import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'
import { Encoder } from 'modern-gif'
import { createServer } from 'vite'
import { decodePng } from '../actions/render/png.mjs'

const root = path.join(import.meta.dirname, '..')
const output = path.join(root, 'docs', 'images', 'editor.gif')
const VIEWPORT = { width: 1440, height: 900 }
const TEMPLATE = 'Order system'
// A GIF stores the time of each frame in hundredths of a second.
const FPS = 25
const DEVICE_SCALE_FACTOR = 0.75
const FRAME_MS = 1000 / FPS
const MAX_RECORDING_MS = 60_000
const START_HOLD_MS = 1200
const END_HOLD_MS = 2500
const MAX_COLORS = 255

async function openFlow(page, url) {
  await page.goto(url)
  await page
    .getByRole('link', { name: new RegExp(TEMPLATE) })
    .last()
    .click()
  await page.getByRole('button', { name: 'Use this template' }).click()
  await page.locator('[data-editor-canvas] .react-flow__node').first().waitFor()
  await page.getByRole('button', { name: 'Flows' }).click()
  await page.getByRole('button', { name: 'Play' }).waitFor()
  await page.getByRole('button', { name: 'Fit to screen' }).click()
  await page.locator('[data-sonner-toast]').first().waitFor({ state: 'detached' })
}

const server = await createServer({ root, logLevel: 'warn', server: { host: '127.0.0.1', port: 5183 } })
await server.listen()
const browser = await chromium.launch()
try {
  const page = await browser.newPage({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    colorScheme: 'dark',
  })
  await page.clock.install()
  await openFlow(page, server.resolvedUrls.local[0])
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000)
  await page.getByRole('button', { name: 'Play' }).click()
  await page.mouse.move(VIEWPORT.width / 2, 22)

  const encoder = new Encoder({
    width: Math.round(VIEWPORT.width * DEVICE_SCALE_FACTOR),
    height: Math.round(VIEWPORT.height * DEVICE_SCALE_FACTOR),
    maxColors: MAX_COLORS,
  })
  let pending = null
  let frames = 0
  const add = async (delay) => {
    if (pending) await encoder.encode({ data: pending.pixels, delay: pending.delay })
    pending = { pixels: decodePng(await page.screenshot()).pixels, delay }
    frames++
  }
  await add(START_HOLD_MS)
  for (let elapsedMs = 0; elapsedMs < MAX_RECORDING_MS; elapsedMs += FRAME_MS) {
    await page.clock.runFor(FRAME_MS)
    await add(FRAME_MS)
    if (await page.getByRole('button', { name: 'Play' }).isVisible()) break
  }
  await encoder.encode({ data: pending.pixels, delay: END_HOLD_MS })
  const gif = Buffer.from(await encoder.flush('arrayBuffer'))
  writeFileSync(output, gif)
  console.log(`Wrote ${path.relative(root, output)}: ${frames} frames, ${(gif.length / 1024 / 1024).toFixed(1)} MB.`)
} finally {
  await browser.close()
  await server.close()
}
