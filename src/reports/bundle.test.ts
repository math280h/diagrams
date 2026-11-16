import { describe, expect, it } from 'vitest'
import { compressDump, decodeBundle, decompressDump, encodeBundle, MAX_REPORT_JSON_BYTES } from './bundle'

describe('encodeBundle', () => {
  it('reads back the JSON and the dump', () => {
    const dump = new Uint8Array([0x4d, 0x44, 0x4d, 0x50, 1, 2, 3])
    expect(decodeBundle(encodeBundle({ json: '{"a":"ø"}', dump }))).toEqual({ json: '{"a":"ø"}', dump })
    expect(decodeBundle(encodeBundle({ json: '{}', dump: null }))).toEqual({ json: '{}', dump: null })
  })

  it('refuses a JSON text larger than the limit', () => {
    expect(() => encodeBundle({ json: 'x'.repeat(MAX_REPORT_JSON_BYTES + 1), dump: null })).toThrow(/too large/)
  })
})

describe('compressDump', () => {
  it('compresses the zero bytes of a dump, and gives back the same bytes', async () => {
    const dump = new Uint8Array(1024 * 1024)
    dump.set(new TextEncoder().encode('MDMP'))
    const compressed = await compressDump(dump)
    expect(compressed.length).toBeLessThan(dump.length / 100)
    expect(await decompressDump(compressed, dump.length)).toEqual(dump)
  })

  it('stops at the size limit, and refuses bytes that are not gzip data', async () => {
    const compressed = await compressDump(new Uint8Array(1024 * 1024))
    await expect(decompressDump(compressed, 1000)).rejects.toThrow('larger than 1000 bytes')
    await expect(decompressDump(new TextEncoder().encode('not gzip'), 1000)).rejects.toThrow()
  })
})

describe('decodeBundle', () => {
  it('refuses bytes of another kind, version or length', () => {
    expect(() => decodeBundle(new TextEncoder().encode('not a report'))).toThrow(/not a Diagrams report file/)
    const bytes = encodeBundle({ json: '{}', dump: null })
    const otherVersion = bytes.slice()
    otherVersion[8] = 9
    expect(() => decodeBundle(otherVersion)).toThrow(/unknown version, 9/)
    const wrongLength = bytes.slice()
    new DataView(wrongLength.buffer).setUint32(9, 1000)
    expect(() => decodeBundle(wrongLength)).toThrow(/wrong length/)
    const tooLong = bytes.slice()
    new DataView(tooLong.buffer).setUint32(9, MAX_REPORT_JSON_BYTES + 1)
    expect(() => decodeBundle(tooLong)).toThrow(/wrong length/)
  })

  it('refuses a JSON text that is not UTF-8', () => {
    const bytes = encodeBundle({ json: 'ab', dump: null })
    bytes[13] = 0xff
    expect(() => decodeBundle(bytes)).toThrow()
  })
})
