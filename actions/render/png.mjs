import { inflateSync } from 'node:zlib'

/**
 * Reads an 8-bit RGB or RGBA PNG without interlace, as Chromium writes screenshots.
 *
 * @returns The size and the pixels as RGBA bytes.
 * @throws Error If the PNG has another colour type, bit depth or interlace.
 */
export function decodePng(png) {
  // A PNG file is an 8 byte signature and chunks of length, type, data and CRC. The IDAT data is one zlib stream of
  // scanlines, and each scanline starts with a filter type from 0 to 4.
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
        throw new Error(`The PNG has a format that this reader does not support (colour type ${colorType}).`)
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

/**
 * Returns true if two PNG images look the same: the same size, and at most `strayPixels` pixels with a colour channel
 * that differs by more than the tolerance. Text, colour and layout changes move many pixels by much more than the
 * tolerance; two renders of the same page can differ in a few anti-aliased pixels at a rounded corner.
 *
 * @param tolerance - The largest channel difference, from 0 to 255, that counts as the same.
 * @param strayPixels - The number of pixels over the tolerance that still count as the same.
 */
export function samePixels(a, b, tolerance = 8, strayPixels = 16) {
  if (a.equals(b)) return true
  const first = decodePng(a)
  const second = decodePng(b)
  if (first.width !== second.width || first.height !== second.height) return false
  let different = 0
  for (let pixel = 0; pixel < first.pixels.length; pixel += 4) {
    for (let channel = pixel; channel < pixel + 4; channel++) {
      if (Math.abs(first.pixels[channel] - second.pixels[channel]) <= tolerance) continue
      different++
      if (different > strayPixels) return false
      break
    }
  }
  return true
}
