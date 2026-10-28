import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { inflateSync } from 'node:zlib'
import { chromium } from '@playwright/test'
import { Encoder } from 'modern-gif'
import { createServer } from 'vite'

const root = path.join(import.meta.dirname, '..')
const output = path.join(root, 'docs', 'images', 'editor.gif')
const VIEWPORT = { width: 1440, height: 900 }
const TEMPLATE = 'Order system'
const FPS = 12
const FRAME_MS = 1000 / FPS
const MAX_RECORDING_MS = 60_000
const START_HOLD_MS = 1200
const END_HOLD_MS = 2500
const MAX_COLORS = 255

// A PNG file is an 8 byte signature and chunks of length, type, data and CRC. The IDAT data is one zlib stream of
// scanlines, and each scanline starts with a filter type from 0 to 4.
function decodePng(png) {
  let offset = 8
  let width = 0
  let height = 0
  let channels = 0
  const parts = []
  while (offset < png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.toString('latin1', offset + 4, offset + 8)
    const data = png.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      const [bitDepth, colorType, , , interlace] = data.subarray(8)
      if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
        throw new Error(`The screenshot is a PNG that this script cannot read (colour type ${colorType}).`)
      }
      channels = colorType === 6 ? 4 : 3
    } else if (type === 'IDAT') {
      parts.push(data)
    }
    offset += length + 12
  }
  const raw = inflateSync(Buffer.concat(parts))
  const stride = width * channels
  const pixels = new Uint8ClampedArray(width * height * 4)
  let previous = new Uint8Array(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const current = new Uint8Array(stride)
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? current[x - channels] : 0
      const up = previous[x]
      const upLeft = x >= channels ? previous[x - channels] : 0
      let predictor = 0
      if (filter === 1) predictor = left
      else if (filter === 2) predictor = up
      else if (filter === 3) predictor = (left + up) >> 1
      else if (filter === 4) {
        const estimate = left + up - upLeft
        const toLeft = Math.abs(estimate - left)
        const toUp = Math.abs(estimate - up)
        const toUpLeft = Math.abs(estimate - upLeft)
        predictor = toLeft <= toUp && toLeft <= toUpLeft ? left : toUp <= toUpLeft ? up : upLeft
      }
      current[x] = (line[x] + predictor) & 0xff
    }
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4
      pixels[at] = current[x * channels]
      pixels[at + 1] = current[x * channels + 1]
      pixels[at + 2] = current[x * channels + 2]
      pixels[at + 3] = channels === 4 ? current[x * channels + 3] : 255
    }
    previous = current
  }
  return { width, height, pixels }
}

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
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: 'dark' })
  await page.clock.install()
  await openFlow(page, server.resolvedUrls.local[0])
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000)
  await page.getByRole('button', { name: 'Play' }).click()
  await page.mouse.move(VIEWPORT.width / 2, 22)

  const encoder = new Encoder({ width: VIEWPORT.width, height: VIEWPORT.height, maxColors: MAX_COLORS })
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
