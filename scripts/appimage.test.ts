import { createHash } from 'node:crypto'
import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  appImageSignatureSections,
  elfSections,
  elfSize,
  embeddedBlockMap,
  hashWithBlankSections,
  runtimeSha256,
} from './appimage.ts'

interface Section {
  name?: string
  type: number
  offset: number
  size: number
}

const SECTION_HEADER_SIZE = 64
const NAMES_OFFSET = 64

function elf(sections: Section[], tableOffset: number, fileSize: number): Uint8Array {
  const file = new Uint8Array(fileSize)
  const view = new DataView(file.buffer)
  view.setUint32(0, 0x7f454c46)
  view.setUint8(4, 2)
  view.setUint8(5, 1)
  view.setBigUint64(0x28, BigInt(tableOffset), true)
  view.setUint16(0x3a, SECTION_HEADER_SIZE, true)
  view.setUint16(0x3c, sections.length + 1, true)
  view.setUint16(0x3e, sections.length, true)
  const encoder = new TextEncoder()
  let nameOffset = 1
  const names: Section = { type: 3, offset: NAMES_OFFSET, size: 0 }
  ;[...sections, names].forEach((section, index) => {
    const entry = tableOffset + index * SECTION_HEADER_SIZE
    if (section.name) {
      file.set(encoder.encode(section.name), NAMES_OFFSET + nameOffset)
      view.setUint32(entry, nameOffset, true)
      nameOffset += section.name.length + 1
    }
    view.setUint32(entry + 4, section.type, true)
    view.setBigUint64(entry + 0x18, BigInt(section.offset), true)
    view.setBigUint64(entry + 0x20, BigInt(section === names ? nameOffset : section.size), true)
  })
  return file
}

function runtimeWithSignatureSections(fileSize = 12_000): Uint8Array {
  return elf(
    [
      { name: '.text', type: 1, offset: 200, size: 100 },
      { name: '.digest_md5', type: 1, offset: 300, size: 16 },
      { name: '.sha256_sig', type: 1, offset: 316, size: 1024 },
      { name: '.sig_key', type: 1, offset: 1340, size: 8192 },
    ],
    9600,
    fileSize,
  )
}

describe('elfSize', () => {
  it('ends after the section header table', () => {
    const file = elf([{ type: 1, offset: 64, size: 100 }], 200, 1000)
    expect(elfSize(file)).toBe(200 + 2 * SECTION_HEADER_SIZE)
  })

  it('ends after a section that follows the section header table', () => {
    const sections = [
      { type: 1, offset: 64, size: 100 },
      { type: 7, offset: 400, size: 50 },
    ]
    expect(elfSize(elf(sections, 200, 1000))).toBe(450)
  })

  it('ignores the size of a section without data', () => {
    const file = elf([{ type: 8, offset: 64, size: 5000 }], 200, 1000)
    expect(elfSize(file)).toBe(200 + 2 * SECTION_HEADER_SIZE)
  })

  it('rejects a file that is not a 64-bit ELF program', () => {
    expect(() => elfSize(new Uint8Array(100))).toThrow('The file does not start with a 64-bit ELF program.')
  })
})

describe('elfSections', () => {
  it('names each section and gives the position and size of its data', () => {
    const sections = elfSections(runtimeWithSignatureSections())
    expect(sections.map((section) => section.name)).toEqual(['.text', '.digest_md5', '.sha256_sig', '.sig_key', ''])
    expect(sections.filter((section) => section.name.startsWith('.s'))).toEqual([
      { name: '.sha256_sig', offset: 316, size: 1024 },
      { name: '.sig_key', offset: 1340, size: 8192 },
    ])
  })
})

describe('appImageSignatureSections', () => {
  it('returns the digest, signature and key sections in that order', () => {
    expect(appImageSignatureSections(runtimeWithSignatureSections()).map((section) => section.name)).toEqual([
      '.digest_md5',
      '.sha256_sig',
      '.sig_key',
    ])
  })

  it('rejects a runtime without a signature section', () => {
    const runtime = elf([{ name: '.digest_md5', type: 1, offset: 300, size: 16 }], 400, 1000)
    expect(() => appImageSignatureSections(runtime)).toThrow('The AppImage runtime has no .sha256_sig section.')
  })
})

describe('hashWithBlankSections', () => {
  it('hashes the given sections as zero bytes', () => {
    const file = Uint8Array.from({ length: 64 }, (_, index) => index + 1)
    const blank = [
      { name: 'b', offset: 40, size: 8 },
      { name: 'a', offset: 10, size: 4 },
    ]
    const expected = file.slice()
    expected.fill(0, 10, 14)
    expected.fill(0, 40, 48)
    expect(hashWithBlankSections(file, blank, 'sha256')).toEqual(createHash('sha256').update(expected).digest())
  })
})

describe('runtimeSha256', () => {
  it('hashes the runtime of an AppImage with empty signature sections', () => {
    const image = runtimeWithSignatureSections(20_000)
    image.fill(7, 12_000)
    const unsigned = createHash('sha256')
      .update(image.subarray(0, elfSize(image)))
      .digest('hex')
    image.fill(9, 300, 1340 + 8192)
    expect(runtimeSha256(image)).toBe(unsigned)
  })
})

describe('embeddedBlockMap', () => {
  function withBlockMap(file: Uint8Array, blockMap: unknown): Uint8Array {
    const data = deflateRawSync(JSON.stringify(blockMap))
    const length = new Uint8Array(4)
    new DataView(length.buffer).setUint32(0, data.byteLength)
    return Buffer.concat([file, data, length])
  }

  it('reads the block map at the end of a file and where it starts', () => {
    const blockMap = { version: '2', files: [{ name: 'file', offset: 0, checksums: ['a'], sizes: [100] }] }
    const file = withBlockMap(new Uint8Array(100), blockMap)
    expect(embeddedBlockMap(file)).toEqual({ blockMap, start: 100 })
  })

  it('rejects a file without a block map', () => {
    expect(() => embeddedBlockMap(new Uint8Array(100).fill(1))).toThrow('The file does not end with a block map.')
    expect(() => embeddedBlockMap(withBlockMap(new Uint8Array(10), { version: '2' }))).toThrow(
      'The file does not end with a block map.',
    )
  })
})
