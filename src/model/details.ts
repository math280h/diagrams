import type { NodeDetails, NodeLink } from './schema'

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])
const HOST_ONLY = /^[\w-]+(\.[\w-]+)+(:\d+)?([/?#]\S*)?$/

/**
 * Returns the address that a link opens, or `null` if it opens no web or mail address.
 *
 * An address without a scheme, such as `github.com/acme/api`, gets `https://`.
 *
 * @example
 * ```ts
 * safeLinkUrl('github.com/acme/api') // 'https://github.com/acme/api'
 * safeLinkUrl('javascript:alert(1)') // null
 * ```
 */
export function safeLinkUrl(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  const candidate = HOST_ONLY.test(trimmed) ? `https://${trimmed}` : trimmed
  try {
    const parsed = new URL(candidate)
    return SAFE_PROTOCOLS.has(parsed.protocol) ? parsed.href : null
  } catch {
    return null
  }
}

/** Returns the text of a link: its label, or the address without the scheme. */
export function linkText(link: Pick<NodeLink, 'label' | 'url'>): string {
  if (link.label.trim()) return link.label.trim()
  return link.url
    .trim()
    .replace(/^(https?:\/\/|mailto:)/i, '')
    .replace(/\/$/, '')
}

export type TextPart = { kind: 'text'; text: string } | { kind: 'link'; text: string; href: string }

const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]]/gi

/** Splits text into plain parts and the web addresses in it. */
export function linkifyText(text: string): TextPart[] {
  const parts: TextPart[] = []
  let last = 0
  for (const match of text.matchAll(URL_IN_TEXT)) {
    const href = safeLinkUrl(match[0])
    if (!href) continue
    if (match.index > last) parts.push({ kind: 'text', text: text.slice(last, match.index) })
    parts.push({ kind: 'link', text: match[0], href })
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) })
  return parts
}

/** Returns true if the details hold a description, an owner or a link. */
export function hasDetails(details: NodeDetails): boolean {
  return details.description.trim() !== '' || details.owner.trim() !== '' || details.links.length > 0
}
