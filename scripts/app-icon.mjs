import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const buildFolder = path.join(import.meta.dirname, '..', 'build')
const svg = readFileSync(path.join(buildFolder, 'icon.svg'), 'utf8')
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
const PNG_SIZE = 1024

async function render(page, size) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
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
} finally {
  await browser.close()
}
console.log(`Wrote build/icon.png (${PNG_SIZE} px) and build/icon.ico (${ICO_SIZES.join(', ')} px).`)
