import { crc32 } from './crc32'

export interface ZipEntry {
  /** The path of the file in the archive, with `/` between folders. */
  name: string
  data: Uint8Array
}

export class ZipError extends Error {}

const LOCAL_HEADER = 0x04034b50
const CENTRAL_HEADER = 0x02014b50
const END_OF_DIRECTORY = 0x06054b50
const LOCAL_HEADER_BYTES = 30
const CENTRAL_HEADER_BYTES = 46
const END_OF_DIRECTORY_BYTES = 22
const MAX_COMMENT_BYTES = 0xffff
const MAX_ENTRIES = 0xffff
const MAX_OFFSET = 0xffffffff
const VERSION_NEEDED = 20
const FLAG_ENCRYPTED = 0x0001
const FLAG_UTF8 = 0x0800
const METHOD_STORE = 0
const METHOD_DEFLATE = 8
const DOS_EPOCH_YEAR = 1980
const MAX_UNPACKED_FILE_BYTES = 64 * 1024 * 1024

const UNZIP_FIRST = 'Unzip it, then import the diagram files.'
const DAMAGED = 'This zip file is damaged or incomplete.'

async function streamBytes(data: Uint8Array, transform: CompressionStream | DecompressionStream, maxBytes: number) {
  const reader = new Blob([data as BlobPart]).stream().pipeThrough(transform).getReader()
  const parts: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > maxBytes) {
      await reader.cancel()
      throw new ZipError(DAMAGED)
    }
    parts.push(value)
  }
  const result = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function dosTime(date: Date): { time: number; date: number } {
  const year = Math.max(date.getFullYear(), DOS_EPOCH_YEAR)
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - DOS_EPOCH_YEAR) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

/**
 * Packs files into a zip archive. Each file uses deflate, or no compression when deflate does not make it smaller.
 *
 * @param modifiedAt - The change time of each file in the archive.
 * @throws ZipError If the archive needs the ZIP64 extension: more than 65535 files or more than 4 GiB.
 */
export async function zipEntries(entries: readonly ZipEntry[], modifiedAt = new Date()): Promise<Blob> {
  if (entries.length > MAX_ENTRIES) throw new ZipError('A zip file can hold at most 65535 files.')
  const encoder = new TextEncoder()
  const { time, date } = dosTime(modifiedAt)
  const parts: Uint8Array[] = []
  const directory: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const deflated = await streamBytes(entry.data, new CompressionStream('deflate-raw'), Number.MAX_SAFE_INTEGER)
    const compress = deflated.length < entry.data.length
    const body = compress ? deflated : entry.data
    const crc = crc32(entry.data)
    if (offset + LOCAL_HEADER_BYTES + name.length + body.length > MAX_OFFSET) {
      throw new ZipError('A zip file can hold at most 4 GiB.')
    }

    const local = new Uint8Array(LOCAL_HEADER_BYTES + name.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, LOCAL_HEADER, true)
    localView.setUint16(4, VERSION_NEEDED, true)
    localView.setUint16(6, FLAG_UTF8, true)
    localView.setUint16(8, compress ? METHOD_DEFLATE : METHOD_STORE, true)
    localView.setUint16(10, time, true)
    localView.setUint16(12, date, true)
    localView.setUint32(14, crc, true)
    localView.setUint32(18, body.length, true)
    localView.setUint32(22, entry.data.length, true)
    localView.setUint16(26, name.length, true)
    local.set(name, LOCAL_HEADER_BYTES)

    const central = new Uint8Array(CENTRAL_HEADER_BYTES + name.length)
    const centralView = new DataView(central.buffer)
    centralView.setUint32(0, CENTRAL_HEADER, true)
    centralView.setUint16(4, VERSION_NEEDED, true)
    central.set(local.subarray(4, 30), 6)
    centralView.setUint32(42, offset, true)
    central.set(name, CENTRAL_HEADER_BYTES)

    parts.push(local, body)
    directory.push(central)
    offset += local.length + body.length
  }

  const directorySize = directory.reduce((total, part) => total + part.length, 0)
  const end = new Uint8Array(END_OF_DIRECTORY_BYTES)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, END_OF_DIRECTORY, true)
  endView.setUint16(8, entries.length, true)
  endView.setUint16(10, entries.length, true)
  endView.setUint32(12, directorySize, true)
  endView.setUint32(16, offset, true)
  return new Blob([...parts, ...directory, end] as BlobPart[], { type: 'application/zip' })
}

/** Tells whether the bytes start like a zip archive. */
export function isZip(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false
  const signature = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0, true)
  return signature === LOCAL_HEADER || signature === END_OF_DIRECTORY
}

function endOfDirectory(view: DataView): number {
  const last = view.byteLength - END_OF_DIRECTORY_BYTES
  for (let offset = last; offset >= Math.max(0, last - MAX_COMMENT_BYTES); offset--) {
    if (view.getUint32(offset, true) === END_OF_DIRECTORY) return offset
  }
  throw new ZipError(DAMAGED)
}

/**
 * Reads the files of a zip archive. Folders are not in the result.
 *
 * @throws ZipError If the archive is damaged or encrypted, needs ZIP64, holds a file larger than 64 MiB, or uses a
 *   compression other than deflate.
 */
export async function unzipEntries(bytes: Uint8Array): Promise<ZipEntry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < END_OF_DIRECTORY_BYTES) throw new ZipError(DAMAGED)
  const end = endOfDirectory(view)
  const count = view.getUint16(end + 10, true)
  const directoryOffset = view.getUint32(end + 16, true)
  if (count === MAX_ENTRIES || directoryOffset === MAX_OFFSET) {
    throw new ZipError(`This zip file is too large. ${UNZIP_FIRST}`)
  }
  const decoder = new TextDecoder()
  const entries: ZipEntry[] = []
  let cursor = directoryOffset

  for (let index = 0; index < count; index++) {
    if (cursor + CENTRAL_HEADER_BYTES > bytes.length || view.getUint32(cursor, true) !== CENTRAL_HEADER) {
      throw new ZipError(DAMAGED)
    }
    const flags = view.getUint16(cursor + 8, true)
    const method = view.getUint16(cursor + 10, true)
    const crc = view.getUint32(cursor + 16, true)
    const compressedSize = view.getUint32(cursor + 20, true)
    const size = view.getUint32(cursor + 24, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const localOffset = view.getUint32(cursor + 42, true)
    const nameStart = cursor + CENTRAL_HEADER_BYTES
    if (nameStart + nameLength > bytes.length) throw new ZipError(DAMAGED)
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength))
    cursor = nameStart + nameLength + extraLength + commentLength

    if (name.endsWith('/')) continue
    if (flags & FLAG_ENCRYPTED) throw new ZipError(`This zip file is encrypted. ${UNZIP_FIRST}`)
    if (method !== METHOD_STORE && method !== METHOD_DEFLATE) {
      throw new ZipError(`This zip file uses a compression that the app cannot read. ${UNZIP_FIRST}`)
    }
    if (size > MAX_UNPACKED_FILE_BYTES) throw new ZipError(`This zip file is too large. ${UNZIP_FIRST}`)
    if (localOffset + LOCAL_HEADER_BYTES > bytes.length || view.getUint32(localOffset, true) !== LOCAL_HEADER) {
      throw new ZipError(DAMAGED)
    }
    const dataStart =
      localOffset + LOCAL_HEADER_BYTES + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true)
    if (dataStart + compressedSize > bytes.length) throw new ZipError(DAMAGED)
    const stored = bytes.subarray(dataStart, dataStart + compressedSize)

    let data: Uint8Array
    try {
      data = method === METHOD_STORE ? stored : await streamBytes(stored, new DecompressionStream('deflate-raw'), size)
    } catch (error) {
      if (error instanceof ZipError) throw error
      throw new ZipError(DAMAGED, { cause: error })
    }
    if (data.length !== size || crc32(data) !== crc) throw new ZipError(DAMAGED)
    entries.push({ name, data })
  }
  return entries
}
