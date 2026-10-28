import type { Diagram } from '@/model/schema'
import { DiagramFormatError, migrate } from '@/persistence/migrations'

/** The first character of the data in a share link. It names the encoding: JSON in raw deflate, in base64url. */
const DEFLATE_PREFIX = 'z'

/** Links longer than this can break in some chat apps and mail programs. */
export const LONG_LINK_CHARS = 8000

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

/** Matches the ids that `newId` makes, such as `n_4k2j9x0q7a`. */
const GENERATED_ID = /^([a-z]{1,4})_[0-9a-z]{10}$/
const ID_KEYS = new Set(['id', 'source', 'target', 'parentId'])

/** Returns JSON of the content with short ids in the id fields, such as `n_3` for `n_4k2j9x0q7a`. */
function compactJson(content: object): string {
  const shortIds = new Map<string, string>()
  return JSON.stringify(content, (key, value: unknown) => {
    if (typeof value !== 'string' || !ID_KEYS.has(key)) return value
    const match = GENERATED_ID.exec(value)
    if (!match) return value
    let short = shortIds.get(value)
    if (!short) shortIds.set(value, (short = `${match[1]}_${shortIds.size.toString(36)}`))
    return short
  })
}

/** Returns the share data of a diagram: its content without the local id, timestamps and save counter. */
export async function encodeShareData(diagram: Diagram): Promise<string> {
  const { id: _id, rev: _rev, createdAt: _createdAt, updatedAt: _updatedAt, ...content } = diagram
  const json = new TextEncoder().encode(compactJson(content))
  return DEFLATE_PREFIX + toBase64Url(await transform(json, new CompressionStream('deflate-raw')))
}

/**
 * Reads the diagram in share data.
 *
 * @returns A diagram with a new id, in the current format.
 * @throws ShareLinkError If the data is damaged or holds no diagram that this app can read.
 */
export async function decodeShareData(data: string): Promise<Diagram> {
  if (!data.startsWith(DEFLATE_PREFIX)) throw new ShareLinkError('This link does not hold a diagram.')
  let content: unknown
  try {
    const bytes = await transform(fromBase64Url(data.slice(1)), new DecompressionStream('deflate-raw'))
    content = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new ShareLinkError('This link is not complete. Ask for the link again, or copy all of it.')
  }
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
