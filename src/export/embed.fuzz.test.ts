import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { EMBED_TYPE, embeddedDiagramText, EmbeddedDiagramError } from './embed'

const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)
const SLOW = { timeout: 60_000 }

function bytes(...parts: (Uint8Array | string)[]): Uint8Array<ArrayBuffer> {
  const encoded = parts.map((part) => (typeof part === 'string' ? Uint8Array.from(part, (c) => c.charCodeAt(0)) : part))
  const result = new Uint8Array(encoded.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of encoded) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function length(value: number): Uint8Array {
  const result = new Uint8Array(4)
  new DataView(result.buffer).setUint32(0, value)
  return result
}

const textChunk = fc
  .record({
    keyword: fc.oneof(fc.constant(EMBED_TYPE), fc.string({ maxLength: 20 })),
    flags: fc.uint8Array({ maxLength: 4 }),
    body: fc.uint8Array({ maxLength: 64 }),
    declaredLength: fc.option(fc.nat(), { nil: undefined }),
  })
  .map(({ keyword, flags, body, declaredLength }) => {
    const data = bytes(keyword, Uint8Array.of(0), flags, body)
    return bytes(length(declaredLength ?? data.length), 'iTXt', data, new Uint8Array(4))
  })
const png = fc
  .array(fc.oneof(textChunk, fc.uint8Array({ maxLength: 32 })), { maxLength: 4 })
  .map((parts) => bytes(PNG_SIGNATURE, ...parts))
const base64 = fc
  .array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='.split('')), {
    maxLength: 80,
  })
  .map((characters) => characters.join(''))
const svg = base64.map((text) => bytes(`<svg><metadata data-type="${EMBED_TYPE}">${text}</metadata></svg>`))

describe('image input', () => {
  it('reads a large text chunk without a keyword end as a PNG without a diagram', async () => {
    const data = new Uint8Array(500_000).fill(65)
    const file = bytes(PNG_SIGNATURE, length(data.length), 'iTXt', data, new Uint8Array(4))
    expect(await embeddedDiagramText(new Blob([file]))).toBeNull()
  })

  it('finds the diagram text in any file, or returns null, or rejects damaged data', SLOW, async () => {
    await fc.assert(
      fc.asyncProperty(fc.oneof(fc.uint8Array({ maxLength: 64 }), png, svg), async (file) => {
        try {
          const text = await embeddedDiagramText(new Blob([file]))
          expect(text === null || typeof text === 'string').toBe(true)
        } catch (error) {
          expect(error).toBeInstanceOf(EmbeddedDiagramError)
        }
      }),
      { numRuns: 300 },
    )
  })
})
