import { createHash } from 'node:crypto'
import { inflateRawSync } from 'node:zlib'

const ELF_MAGIC = 0x7f454c46
const ELF_64_BIT = 2
const ELF_LITTLE_ENDIAN = 1
const ELF_HEADER_SIZE = 64
const SECTION_WITHOUT_DATA = 8
const BLOCK_MAP_LENGTH_BYTES = 4

/** The sections of the AppImage runtime for the MD5 digest, the OpenPGP signature and the public key. */
export const APPIMAGE_SIGNATURE_SECTIONS = ['.digest_md5', '.sha256_sig', '.sig_key'] as const

export interface ElfSection {
  name: string
  /** The position of the section data in the file, in bytes. */
  offset: number
  /** The size of the section data in bytes. */
  size: number
}

interface SectionHeader {
  nameOffset: number
  type: number
  offset: number
  size: number
}

function elfHeaders(file: Uint8Array): { headers: SectionHeader[]; namesIndex: number; tableEnd: number } {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
  if (file.byteLength < ELF_HEADER_SIZE || view.getUint32(0) !== ELF_MAGIC || view.getUint8(4) !== ELF_64_BIT) {
    throw new Error('The file does not start with a 64-bit ELF program.')
  }
  const littleEndian = view.getUint8(5) === ELF_LITTLE_ENDIAN
  const tableOffset = Number(view.getBigUint64(0x28, littleEndian))
  const entrySize = view.getUint16(0x3a, littleEndian)
  const count = view.getUint16(0x3c, littleEndian)
  const headers = Array.from({ length: count }, (_, index) => {
    const entry = tableOffset + index * entrySize
    return {
      nameOffset: view.getUint32(entry, littleEndian),
      type: view.getUint32(entry + 4, littleEndian),
      offset: Number(view.getBigUint64(entry + 0x18, littleEndian)),
      size: Number(view.getBigUint64(entry + 0x20, littleEndian)),
    }
  })
  return { headers, namesIndex: view.getUint16(0x3e, littleEndian), tableEnd: tableOffset + entrySize * count }
}

/**
 * Returns the size of the 64-bit ELF program at the start of a file, such as the runtime of an AppImage. The program
 * ends after its last section or after its section header table.
 *
 * @throws Error If the file does not start with a 64-bit ELF header.
 */
export function elfSize(file: Uint8Array): number {
  const { headers, tableEnd } = elfHeaders(file)
  return headers
    .filter((header) => header.type !== SECTION_WITHOUT_DATA)
    .reduce((end, header) => Math.max(end, header.offset + header.size), tableEnd)
}

/**
 * Returns the sections of the 64-bit ELF program at the start of a file.
 *
 * @throws Error If the file does not start with a 64-bit ELF header.
 */
export function elfSections(file: Uint8Array): ElfSection[] {
  const { headers, namesIndex } = elfHeaders(file)
  const names = headers[namesIndex]
  if (!names) throw new Error('The ELF program has no table of section names.')
  const decoder = new TextDecoder()
  return headers.map(({ nameOffset, offset, size }) => {
    const start = names.offset + nameOffset
    return { name: decoder.decode(file.subarray(start, file.indexOf(0, start))), offset, size }
  })
}

/** Returns the hash of a file in which the given sections hold only zero bytes, as the AppImage tools compute it. */
export function hashWithBlankSections(
  file: Uint8Array,
  blank: readonly ElfSection[],
  algorithm: 'md5' | 'sha256',
): Buffer {
  const hash = createHash(algorithm)
  let position = 0
  for (const section of blank.toSorted((a, b) => a.offset - b.offset)) {
    hash.update(file.subarray(position, section.offset))
    hash.update(new Uint8Array(section.size))
    position = section.offset + section.size
  }
  hash.update(file.subarray(position))
  return hash.digest()
}

/**
 * Returns the sections that hold the signature data of an AppImage, in the order of
 * {@link APPIMAGE_SIGNATURE_SECTIONS}.
 *
 * @throws Error If the runtime of the AppImage does not have one of the sections.
 */
export function appImageSignatureSections(image: Uint8Array): [ElfSection, ElfSection, ElfSection] {
  const sections = elfSections(image)
  const [digest, signature, key] = APPIMAGE_SIGNATURE_SECTIONS.map((name) => {
    const section = sections.find((candidate) => candidate.name === name)
    if (!section || section.size === 0) throw new Error(`The AppImage runtime has no ${name} section.`)
    return section
  })
  return [digest!, signature!, key!]
}

/**
 * Returns the SHA-256 of the runtime of an AppImage with empty signature sections, which is the SHA-256 of the
 * runtime before a signature.
 */
export function runtimeSha256(image: Uint8Array): string {
  const runtime = image.subarray(0, elfSize(image))
  return hashWithBlankSections(runtime, appImageSignatureSections(runtime), 'sha256').toString('hex')
}

interface BlockMapFile {
  name: string
  offset: number
  checksums: string[]
  sizes: number[]
}

/** The block map of electron-builder, which electron-updater reads for a differential update. */
export interface BlockMap {
  version: string
  files: BlockMapFile[]
}

/** Returns the block map that a block map region holds: compressed data, then its length in 4 bytes. */
export function readBlockMap(region: Uint8Array): BlockMap {
  const data = region.subarray(0, region.byteLength - BLOCK_MAP_LENGTH_BYTES)
  return JSON.parse(inflateRawSync(data).toString()) as BlockMap
}

/**
 * Returns the block map at the end of a file, as electron-builder appends it to an AppImage.
 *
 * @returns The block map and the position where its region starts.
 * @throws Error If the end of the file is not a block map.
 */
export function embeddedBlockMap(file: Uint8Array): { blockMap: BlockMap; start: number } {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
  const length =
    file.byteLength >= BLOCK_MAP_LENGTH_BYTES ? view.getUint32(file.byteLength - BLOCK_MAP_LENGTH_BYTES) : 0
  const start = file.byteLength - BLOCK_MAP_LENGTH_BYTES - length
  let blockMap: BlockMap | null = null
  if (length > 0 && start >= 0) {
    try {
      blockMap = readBlockMap(file.subarray(start))
    } catch {
      blockMap = null
    }
  }
  if (!blockMap || !Array.isArray(blockMap.files)) throw new Error('The file does not end with a block map.')
  return { blockMap, start }
}
