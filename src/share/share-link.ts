import type { Diagram } from '@/model/schema'
import { DiagramFormatError, migrate } from '@/persistence/migrations'
import { compressLink, decompressLink } from './link-codec'
import { type Json, withExplicitIds, withImplicitIds } from './link-ids'

/**
 * The first character of share data in the current format: a length, a checksum and the JSON with implicit ids, coded
 * by the context model with the link dictionary, in base64url, then {@link MODEL_END}.
 */
const MODEL_PREFIX = 'y'
/** The last character of share data in the format `y`, so that a link never ends in a character that apps cut. */
const MODEL_END = 'x'
/** The first character of share data from earlier versions: JSON with short ids in raw deflate, in base64url. */
const DEFLATE_PREFIX = 'z'

/** Links longer than this can break in some chat apps and mail programs. */
export const LONG_LINK_CHARS = 8000
/** The most bytes of JSON in a link. It also limits the work for a damaged link. */
export const MAX_LINK_JSON_BYTES = 2 * 1024 * 1024
/** The length of the link dictionary. A change to it or to the dictionary needs a new prefix. */
export const DICTIONARY_CHARS = 160 * 1024

const INCOMPLETE = 'This link is not complete. Ask for the link again, or copy all of it.'

export class ShareLinkError extends Error {}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const output = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(output).arrayBuffer())
}

/** Returns a 16-bit FNV-1a hash of the bytes. */
function checksum(bytes: Uint8Array): number {
  let hash = 0x811c9dc5
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0
  return (hash >>> 16) ^ (hash & 0xffff)
}

function varint(value: number): number[] {
  const out: number[] = []
  let rest = value
  while (rest >= 0x80) {
    out.push((rest & 0x7f) | 0x80)
    rest = Math.floor(rest / 0x80)
  }
  out.push(rest)
  return out
}

function readVarint(bytes: Uint8Array): { value: number; length: number } {
  let value = 0
  let scale = 1
  for (let i = 0; i < Math.min(bytes.length, 5); i++) {
    const byte = bytes[i]!
    value += (byte & 0x7f) * scale
    if (byte < 0x80) return { value, length: i + 1 }
    scale *= 0x80
  }
  throw new ShareLinkError(INCOMPLETE)
}

/** Returns the JSON that a share link carries for a diagram: its content without the local id, timestamps and save counter. */
export function linkJson(diagram: Diagram): string {
  const { id: _id, rev: _rev, createdAt: _createdAt, updatedAt: _updatedAt, ...content } = diagram
  return JSON.stringify(withImplicitIds(content))
}

/**
 * Returns the share data of a diagram.
 *
 * @throws ShareLinkError If the diagram is too large for a link.
 */
export async function encodeShareData(diagram: Diagram): Promise<string> {
  const json = new TextEncoder().encode(linkJson(diagram))
  if (json.length > MAX_LINK_JSON_BYTES) {
    throw new ShareLinkError('This diagram is too large for a link. Export a web page or a diagram file instead.')
  }
  const sum = checksum(json)
  const packed = await compressLink(json)
  const header = [...varint(json.length), sum >> 8, sum & 0xff]
  const payload = new Uint8Array(header.length + packed.length)
  payload.set(header)
  payload.set(packed, header.length)
  return MODEL_PREFIX + toBase64Url(payload) + MODEL_END
}

async function readModelData(data: string): Promise<unknown> {
  if (!data.endsWith(MODEL_END)) throw new ShareLinkError(INCOMPLETE)
  let payload: Uint8Array
  try {
    payload = fromBase64Url(data.slice(MODEL_PREFIX.length, -MODEL_END.length))
  } catch {
    throw new ShareLinkError(INCOMPLETE)
  }
  const size = readVarint(payload)
  if (size.value > MAX_LINK_JSON_BYTES || payload.length < size.length + 2) throw new ShareLinkError(INCOMPLETE)
  const sum = (payload[size.length]! << 8) | payload[size.length + 1]!
  const json = await decompressLink(payload.subarray(size.length + 2), size.value).catch(() => {
    throw new ShareLinkError(INCOMPLETE)
  })
  if (checksum(json) !== sum) throw new ShareLinkError(INCOMPLETE)
  try {
    return withExplicitIds(JSON.parse(new TextDecoder().decode(json)) as Json)
  } catch {
    throw new ShareLinkError(INCOMPLETE)
  }
}

async function readDeflateData(data: string): Promise<unknown> {
  try {
    const bytes = await transform(
      fromBase64Url(data.slice(DEFLATE_PREFIX.length)),
      new DecompressionStream('deflate-raw'),
    )
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new ShareLinkError(INCOMPLETE)
  }
}

/**
 * Reads the diagram in share data, in the current format or in an earlier one.
 *
 * @returns A diagram with a new id, in the current format.
 * @throws ShareLinkError If the data is damaged or holds no diagram that this app can read.
 */
export async function decodeShareData(data: string): Promise<Diagram> {
  let content: unknown
  if (data.startsWith(MODEL_PREFIX)) content = await readModelData(data)
  else if (data.startsWith(DEFLATE_PREFIX)) content = await readDeflateData(data)
  else throw new ShareLinkError('This link does not hold a diagram.')
  const now = Date.now()
  try {
    return migrate({ ...(content as object), id: 'd_shared', rev: 0, createdAt: now, updatedAt: now })
  } catch (error) {
    throw new ShareLinkError(error instanceof DiagramFormatError ? error.message : 'This link holds no diagram.')
  }
}

/** Returns the address of a share link on the site at `base`, for example `https://draw.thias.dev/`. */
export function shareUrl(base: string, data: string): string {
  return `${base}#/s/${data}`
}
