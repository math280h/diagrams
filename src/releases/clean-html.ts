const KEPT_ELEMENTS = new Set([
  'A',
  'B',
  'BLOCKQUOTE',
  'BR',
  'CODE',
  'DEL',
  'EM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HR',
  'I',
  'KBD',
  'LI',
  'OL',
  'P',
  'PRE',
  'S',
  'STRONG',
  'SUB',
  'SUP',
  'TABLE',
  'TBODY',
  'TD',
  'TH',
  'THEAD',
  'TR',
  'UL',
])

const DROPPED_WITH_CONTENT = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT'])
const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml'
const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

function linkTarget(href: string | null): string | null {
  if (!href) return null
  try {
    const url = new URL(href, 'https://github.com/')
    return LINK_PROTOCOLS.has(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

function clean(source: Node, into: Node) {
  for (const child of source.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      into.appendChild(document.createTextNode(child.textContent ?? ''))
      continue
    }
    if (!(child instanceof Element)) continue
    if (child.namespaceURI !== HTML_NAMESPACE || DROPPED_WITH_CONTENT.has(child.tagName)) continue
    if (!KEPT_ELEMENTS.has(child.tagName)) {
      clean(child, into)
      continue
    }
    const copy = document.createElement(child.tagName.toLowerCase())
    if (child.tagName === 'A') {
      const href = linkTarget(child.getAttribute('href'))
      if (href) {
        copy.setAttribute('href', href)
        copy.setAttribute('target', '_blank')
        copy.setAttribute('rel', 'noopener noreferrer')
      }
    }
    clean(child, copy)
    into.appendChild(copy)
  }
}

/**
 * Rebuilds release notes HTML from text elements and web or mail links only. No attribute stays but the link target.
 *
 * @returns New nodes that a page can insert as they are.
 */
export function cleanReleaseHtml(html: string): DocumentFragment {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const fragment = document.createDocumentFragment()
  clean(parsed.body, fragment)
  return fragment
}
