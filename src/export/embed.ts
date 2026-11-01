import type { Diagram } from '@/model/schema'

/** The media type of the diagram data in an exported image. It is also the keyword of the PNG text chunk. */
export const EMBED_TYPE = 'application/vnd.diagrams+json'

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
const ITXT = 'iTXt'
const IEND = 'IEND'
const SVG_METADATA = /<metadata data-type="application\/vnd\.diagrams\+json">([A-Za-z0-9+/=]*)<\/metadata>/

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

// The `deflate` format of the Compression Streams API is the zlib format, which PNG text chunks use.
async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function ascii(text: string): Uint8Array {
  return Uint8Array.from(text, (character) => character.charCodeAt(0))
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function chunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const head = new Uint8Array(8)
  new DataView(head.buffer).setUint32(0, data.length)
  head.set(ascii(type), 4)
  const tail = new Uint8Array(4)
  new DataView(tail.buffer).setUint32(0, crc32(concat([ascii(type), data])))
  return concat([head, data, tail])
}

function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
}

function* chunks(bytes: Uint8Array): Generator<{ type: string; start: number; data: Uint8Array }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = PNG_SIGNATURE.length
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
    yield { type, start: offset, data: bytes.subarray(offset + 8, offset + 8 + length) }
    offset += 12 + length
  }
}

function diagramText(diagram: Diagram): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(diagram))
}

/** Returns the PNG image with the diagram in a compressed text chunk, so that Diagrams can open the image again. */
export async function pngWithDiagram(png: Blob, diagram: Diagram): Promise<Blob> {
  const bytes = new Uint8Array(await png.arrayBuffer())
  if (!isPng(bytes)) throw new Error('The image is not a PNG.')
  const end = [...chunks(bytes)].find((candidate) => candidate.type === IEND)
  if (!end) throw new Error('The PNG has no end.')
  // An iTXt chunk holds: keyword, 0, compression flag 1, method 0, empty language, 0, empty translation, 0, text.
  const data = concat([ascii(EMBED_TYPE), Uint8Array.of(0, 1, 0, 0, 0), await deflate(diagramText(diagram))])
  return new Blob([bytes.subarray(0, end.start), chunk(ITXT, data), bytes.subarray(end.start)], {
    type: 'image/png',
  })
}

function toBase64(bytes: Uint8Array): string {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text)
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (character) => character.charCodeAt(0))
}

/** Returns the SVG image with the diagram in a `metadata` element, so that Diagrams can open the image again. */
export async function svgWithDiagram(svg: Blob, diagram: Diagram): Promise<Blob> {
  const text = await svg.text()
  const open = /<svg\b[^>]*>/.exec(text)
  if (!open) throw new Error('The image is not an SVG.')
  const at = open.index + open[0].length
  const metadata = `<metadata data-type="${EMBED_TYPE}">${toBase64(await deflate(diagramText(diagram)))}</metadata>`
  return new Blob([text.slice(0, at), metadata, text.slice(at)], { type: 'image/svg+xml' })
}

/** The image holds diagram data that the app cannot read. */
export class EmbeddedDiagramError extends Error {}

async function readText(read: () => Promise<Uint8Array> | Uint8Array): Promise<string> {
  try {
    return new TextDecoder().decode(await read())
  } catch {
    throw new EmbeddedDiagramError('The diagram data in this image is damaged.')
  }
}

async function pngText(bytes: Uint8Array): Promise<string | null> {
  for (const { type, data } of chunks(bytes)) {
    if (type !== ITXT) continue
    const keywordEnd = data.indexOf(0)
    if (keywordEnd === -1 || new TextDecoder('latin1').decode(data.subarray(0, keywordEnd)) !== EMBED_TYPE) continue
    const compressed = data[keywordEnd + 1] === 1
    const languageEnd = data.indexOf(0, keywordEnd + 3)
    const translationEnd = data.indexOf(0, languageEnd + 1)
    const body = data.subarray(translationEnd + 1)
    return readText(() => (compressed ? inflate(body) : body))
  }
  return null
}

/**
 * Returns the diagram JSON that an exported PNG or SVG image holds.
 *
 * @returns `null` if the file is not such an image or holds no diagram.
 * @throws EmbeddedDiagramError If the image holds diagram data that is damaged.
 */
export async function embeddedDiagramText(file: Blob): Promise<string | null> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (isPng(bytes)) return pngText(bytes)
  const match = SVG_METADATA.exec(new TextDecoder().decode(bytes))
  return match ? readText(() => inflate(fromBase64(match[1]!))) : null
}
