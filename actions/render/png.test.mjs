import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { changedRegions, cropRows, decodePng, drawBoxes, encodePng, samePixels, viewRows } from './png.mjs'

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  return Buffer.concat([length, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)])
}

function png(width, rows) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(rows.length, 4)
  header[8] = 8
  header[9] = 6
  const raw = Buffer.concat(rows.map((row) => Buffer.from([0, ...row.flat()])))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const BLACK = [0, 0, 0, 255]
const WHITE = [255, 255, 255, 255]

describe('png', () => {
  it('reads the pixels of an RGBA image', () => {
    const image = decodePng(png(2, [[BLACK, WHITE]]))
    expect(image).toMatchObject({ width: 2, height: 1 })
    expect([...image.pixels]).toEqual([...BLACK, ...WHITE])
  })

  it('counts small differences at text edges as the same, and real changes as different', () => {
    const base = png(2, [
      [BLACK, WHITE],
      [WHITE, BLACK],
    ])
    expect(samePixels(base, base)).toBe(true)
    expect(
      samePixels(
        base,
        png(2, [
          [[4, 3, 0, 255], WHITE],
          [WHITE, BLACK],
        ]),
      ),
    ).toBe(true)
    expect(
      samePixels(
        base,
        png(2, [
          [[40, 0, 0, 255], WHITE],
          [WHITE, BLACK],
        ]),
        8,
        0,
      ),
    ).toBe(false)
    expect(samePixels(base, png(1, [[BLACK], [WHITE]]))).toBe(false)
  })

  it('counts a few stray pixels at an anti-aliased corner as the same, and more of them as different', () => {
    const row = (count, color) => Array.from({ length: count }, () => color)
    const base = png(20, [row(20, WHITE), row(20, WHITE)])
    const corner = png(20, [[[219, 219, 219, 255], [182, 182, 182, 255], ...row(18, WHITE)], row(20, WHITE)])
    expect(samePixels(base, corner, 8, 2)).toBe(true)
    const line = png(20, [row(20, [200, 200, 200, 255]), row(20, WHITE)])
    expect(samePixels(base, line, 8, 2)).toBe(false)
    expect(samePixels(base, line)).toBe(false)
  })

  it('writes a PNG that it reads back, with alpha only when a pixel is not opaque', () => {
    const opaque = { width: 2, height: 2, pixels: new Uint8ClampedArray([...BLACK, ...WHITE, ...WHITE, ...BLACK]) }
    const written = encodePng(opaque)
    expect(written[25]).toBe(2)
    expect(decodePng(written)).toEqual(opaque)
    const clear = { width: 1, height: 1, pixels: new Uint8ClampedArray([10, 20, 30, 0]) }
    expect(encodePng(clear)[25]).toBe(6)
    expect(decodePng(encodePng(clear))).toEqual(clear)
  })
})

function canvas(width, height, color = WHITE) {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let at = 0; at < pixels.length; at += 4) pixels.set(color, at)
  return { width, height, pixels }
}

function paint(image, { x, y, width, height }, color = BLACK) {
  const copy = { ...image, pixels: new Uint8ClampedArray(image.pixels) }
  for (let row = y; row < y + height; row++) {
    for (let column = x; column < x + width; column++) copy.pixels.set(color, (row * image.width + column) * 4)
  }
  return copy
}

describe('changed regions', () => {
  const base = canvas(400, 300)

  it('finds each change apart, and joins changes that are close', () => {
    const changed = paint(paint(base, { x: 20, y: 20, width: 10, height: 10 }), {
      x: 300,
      y: 200,
      width: 30,
      height: 20,
    })
    expect(changedRegions(base, changed)).toEqual([
      { x: 16, y: 16, width: 16, height: 16 },
      { x: 288, y: 192, width: 48, height: 32 },
    ])
    const close = paint(paint(base, { x: 20, y: 20, width: 10, height: 10 }), { x: 50, y: 20, width: 10, height: 10 })
    expect(changedRegions(base, close)).toEqual([{ x: 16, y: 16, width: 48, height: 16 }])
  })

  it('leaves out a few stray pixels at a text edge, and small differences in colour', () => {
    const noise = paint(paint(base, { x: 20, y: 20, width: 1, height: 1 }), { x: 100, y: 100, width: 40, height: 4 })
    expect(changedRegions(base, noise)).toEqual([{ x: 96, y: 96, width: 48, height: 16 }])
    expect(changedRegions(base, paint(base, { x: 0, y: 0, width: 50, height: 50 }, [250, 250, 250, 255]))).toEqual([])
  })

  it('counts the part that only the larger image has as changed', () => {
    expect(changedRegions(base, canvas(400, 340))).toEqual([{ x: 0, y: 288, width: 400, height: 52 }])
  })

  it('merges the nearest regions until no more than the limit are left', () => {
    let changed = base
    for (const x of [16, 112, 208, 304]) changed = paint(changed, { x, y: 16, width: 8, height: 8 })
    changed = paint(changed, { x: 16, y: 272, width: 8, height: 8 })
    const regions = changedRegions(base, changed, { maxRegions: 2 })
    expect(regions).toEqual([
      { x: 16, y: 16, width: 304, height: 16 },
      { x: 16, y: 272, width: 16, height: 16 },
    ])
  })
})

describe('marked images', () => {
  it('draws an outline around a region, outside its padding', () => {
    const image = drawBoxes(canvas(40, 40), [{ x: 10, y: 10, width: 20, height: 20 }], { lineWidthPx: 1, paddingPx: 2 })
    const at = (x, y) => [...image.pixels.subarray((y * 40 + x) * 4, (y * 40 + x) * 4 + 4)]
    expect(at(7, 7)).toEqual([229, 72, 77, 255])
    expect(at(32, 20)).toEqual([229, 72, 77, 255])
    expect(at(8, 8)).toEqual(WHITE)
    expect(at(20, 20)).toEqual(WHITE)
  })

  it('cuts rows out of an image', () => {
    const image = paint(canvas(2, 4), { x: 0, y: 2, width: 2, height: 1 })
    const rows = cropRows(image, 2, 5)
    expect(rows).toMatchObject({ width: 2, height: 2 })
    expect([...rows.pixels.subarray(0, 4)]).toEqual(BLACK)
  })

  it('shows the rows of the changes with a margin, between the least and the most rows', () => {
    const limits = { marginPx: 10, minHeightPx: 100, maxHeightPx: 300 }
    expect(viewRows([], 1000, limits)).toEqual({ top: 0, height: 300 })
    expect(viewRows([{ x: 0, y: 400, width: 10, height: 150 }], 1000, limits)).toEqual({ top: 390, height: 170 })
    expect(viewRows([{ x: 0, y: 400, width: 10, height: 20 }], 1000, limits)).toEqual({ top: 360, height: 100 })
    expect(viewRows([{ x: 0, y: 100, width: 10, height: 800 }], 1000, limits)).toEqual({ top: 90, height: 300 })
  })
})
