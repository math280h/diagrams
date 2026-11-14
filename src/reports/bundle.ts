const MAGIC = 'DGREPORT'
const VERSION = 1
const HEADER_BYTES = MAGIC.length + 1 + 4

/** The largest report JSON that {@link decodeBundle} accepts, in bytes. */
export const MAX_REPORT_JSON_BYTES = 256 * 1024

export interface Bundle {
  json: string
  /** The crash dump compressed with {@link compressDump}, or `null` for a report without a dump. */
  dump: Uint8Array | null
}

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array<ArrayBuffer>> {
  const chunk = bytes.buffer instanceof ArrayBuffer ? (bytes as Uint8Array<ArrayBuffer>) : bytes.slice()
  return new ReadableStream({
    start(controller) {
      controller.enqueue(chunk)
      controller.close()
    },
  })
}

async function collect(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > maxBytes) {
      await reader.cancel()
      throw new Error(`The crash dump is larger than ${maxBytes} bytes.`)
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

/** Returns a crash dump compressed with gzip, for {@link encodeBundle}. */
export function compressDump(dump: Uint8Array): Promise<Uint8Array> {
  return collect(streamOf(dump).pipeThrough(new CompressionStream('gzip')), Number.MAX_SAFE_INTEGER)
}

/**
 * Returns the crash dump of a bundle without the compression.
 *
 * @param maxBytes - The largest dump that the caller accepts. A larger dump stops the decompression.
 * @throws Error If the bytes are not gzip data, or the dump is larger than `maxBytes`.
 */
export function decompressDump(compressed: Uint8Array, maxBytes: number): Promise<Uint8Array> {
  return collect(streamOf(compressed).pipeThrough(new DecompressionStream('gzip')), maxBytes)
}

/**
 * Returns the bytes that a report file holds before encryption: a fixed header, the report JSON and the compressed
 * crash dump.
 *
 * @throws Error If the JSON is larger than {@link MAX_REPORT_JSON_BYTES}.
 */
export function encodeBundle({ json, dump }: Bundle): Uint8Array {
  const text = new TextEncoder().encode(json)
  if (text.length > MAX_REPORT_JSON_BYTES) throw new Error('The report text is too large.')
  const dumpBytes = dump ?? new Uint8Array(0)
  const bytes = new Uint8Array(HEADER_BYTES + text.length + dumpBytes.length)
  bytes.set(new TextEncoder().encode(MAGIC), 0)
  const view = new DataView(bytes.buffer)
  view.setUint8(MAGIC.length, VERSION)
  view.setUint32(MAGIC.length + 1, text.length)
  bytes.set(text, HEADER_BYTES)
  bytes.set(dumpBytes, HEADER_BYTES + text.length)
  return bytes
}

/**
 * Reads the report JSON and the crash dump from the bytes of a decrypted report file.
 *
 * @throws Error If the bytes are not a report file of a known version, or the JSON is too large.
 */
export function decodeBundle(bytes: Uint8Array): Bundle {
  if (bytes.length < HEADER_BYTES || new TextDecoder().decode(bytes.subarray(0, MAGIC.length)) !== MAGIC) {
    throw new Error('This is not a Diagrams report file.')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const version = view.getUint8(MAGIC.length)
  if (version !== VERSION) throw new Error(`This report file has an unknown version, ${version}.`)
  const length = view.getUint32(MAGIC.length + 1)
  if (length > MAX_REPORT_JSON_BYTES || HEADER_BYTES + length > bytes.length) {
    throw new Error('The report text in this file has a wrong length.')
  }
  const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(HEADER_BYTES, HEADER_BYTES + length))
  const rest = bytes.subarray(HEADER_BYTES + length)
  return { json, dump: rest.length > 0 ? rest : null }
}
