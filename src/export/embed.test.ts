import { describe, expect, it } from 'vitest'
import { createDiagram } from '@/model/defaults'
import { embeddedDiagramText, pngWithDiagram, svgWithDiagram } from './embed'

const ONE_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

function pngBlob() {
  return new Blob([Uint8Array.from(atob(ONE_PIXEL_PNG), (character) => character.charCodeAt(0))], {
    type: 'image/png',
  })
}

function crc32(bytes: Uint8Array): number {
  let crc = ~0
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return ~crc >>> 0
}

function chunkTypes(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const found: { type: string; crcOk: boolean }[] = []
  let offset = 8
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset)
    const typeAndData = bytes.subarray(offset + 4, offset + 8 + length)
    found.push({
      type: String.fromCharCode(...typeAndData.subarray(0, 4)),
      crcOk: view.getUint32(offset + 8 + length) === crc32(typeAndData),
    })
    offset += 12 + length
  }
  return found
}

describe('diagram data in exported images', () => {
  const diagram = { ...createDiagram('Café 日本'), id: 'd1' }

  it('keeps the diagram in a PNG text chunk before the end, with a valid checksum', async () => {
    const png = await pngWithDiagram(pngBlob(), diagram)
    const bytes = new Uint8Array(await png.arrayBuffer())
    expect(chunkTypes(bytes)).toEqual([
      { type: 'IHDR', crcOk: true },
      { type: 'IDAT', crcOk: true },
      { type: 'iTXt', crcOk: true },
      { type: 'IEND', crcOk: true },
    ])
    expect(JSON.parse((await embeddedDiagramText(png))!)).toEqual(diagram)
  })

  it('keeps the diagram in an SVG metadata element', async () => {
    const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect/></svg>'])
    const result = await svgWithDiagram(svg, diagram)
    expect(await result.text()).toMatch(/^<svg [^>]*><metadata data-type="application\/vnd\.diagrams\+json">/)
    expect(JSON.parse((await embeddedDiagramText(result))!)).toEqual(diagram)
  })

  it('finds no diagram in an image without one', async () => {
    expect(await embeddedDiagramText(pngBlob())).toBeNull()
    expect(await embeddedDiagramText(new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>']))).toBeNull()
  })
})
