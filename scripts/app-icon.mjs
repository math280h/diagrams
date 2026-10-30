import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const buildFolder = path.join(import.meta.dirname, '..', 'build')
const webIconFolder = path.join(import.meta.dirname, '..', 'public', 'icons')
const svg = readFileSync(path.join(buildFolder, 'icon.svg'), 'utf8')
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
const PNG_SIZE = 1024
const WEB_ICON_SIZES = [192, 512]
const MASKABLE_SIZE = 512
const APPLE_TOUCH_SIZE = 180
// A maskable icon and an Apple touch icon fill the whole square. The system cuts the shape.
const fullBleedSvg = svg.replace(/<rect [^>]*\/>/, '<rect width="24" height="24" fill="#0a0a0a"/>')

async function render(page, size, source = svg) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${source.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  )
  return page.locator('svg').screenshot({ omitBackground: true })
}

// An ICO file may hold PNG images: a 6 byte header, a 16 byte entry for each image, then the image data.
function icoFile(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = 6 + images.length * 16
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += data.length
    return entry
  })
  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)])
}

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  writeFileSync(path.join(buildFolder, 'icon.png'), await render(page, PNG_SIZE))
  const images = []
  for (const size of ICO_SIZES) images.push({ size, data: await render(page, size) })
  writeFileSync(path.join(buildFolder, 'icon.ico'), icoFile(images))
  mkdirSync(webIconFolder, { recursive: true })
  for (const size of WEB_ICON_SIZES)
    writeFileSync(path.join(webIconFolder, `icon-${size}.png`), await render(page, size))
  writeFileSync(path.join(webIconFolder, 'icon-maskable.png'), await render(page, MASKABLE_SIZE, fullBleedSvg))
  writeFileSync(path.join(webIconFolder, 'apple-touch-icon.png'), await render(page, APPLE_TOUCH_SIZE, fullBleedSvg))
} finally {
  await browser.close()
}
console.log(
  `Wrote build/icon.png (${PNG_SIZE} px), build/icon.ico (${ICO_SIZES.join(', ')} px) and the web app icons in public/icons.`,
)
