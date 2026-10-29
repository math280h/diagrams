import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { decodePng, samePixels } from './png.mjs'

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
})
