import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { cleanReleaseHtml } from './clean-html'

const KEPT = new Set(
  'a b blockquote br code del em h1 h2 h3 h4 h5 h6 hr i kbd li ol p pre s strong sub sup table tbody td th thead tr ul'.split(
    ' ',
  ),
)
const LINK_ATTRIBUTES = new Set(['href', 'target', 'rel'])
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

const tag = fc.constantFrom(
  ...KEPT,
  ...'script style img iframe svg math object embed template noscript form input button video audio base meta link div span details textarea select a'.split(
    ' ',
  ),
)
const attribute = fc.constantFrom(
  'href',
  'src',
  'onerror',
  'onclick',
  'style',
  'class',
  'srcdoc',
  'formaction',
  'xlink:href',
  'target',
  'rel',
)
const attributeValue = fc.oneof(
  fc.constantFrom(
    'javascript:alert(1)',
    ' JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:alert(1)',
    'https://example.com/',
    '/math280h/diagrams/pull/1',
    'mailto:a@example.com',
    '#top',
  ),
  fc.string({ maxLength: 20 }),
)
const { node: html } = fc.letrec<{ node: string; element: string }>((tie) => ({
  node: fc.oneof({ depthSize: 'small' }, fc.string({ maxLength: 20 }), tie('element')),
  element: fc
    .record({
      name: tag,
      attributes: fc.array(fc.tuple(attribute, attributeValue), { maxLength: 3 }),
      children: fc.array(tie('node'), { maxLength: 3 }),
    })
    .map(
      ({ name, attributes, children }) =>
        `<${name}${attributes.map(([key, value]) => ` ${key}="${value.replaceAll('"', '&quot;')}"`).join('')}>${children.join('')}</${name}>`,
    ),
}))

function expectOnlySafeMarkup(source: string): void {
  const container = document.createElement('div')
  container.append(cleanReleaseHtml(source))
  for (const element of container.querySelectorAll('*')) {
    const name = element.localName
    expect(KEPT.has(name), name).toBe(true)
    for (const { name: key } of element.attributes) {
      expect(name === 'a' && LINK_ATTRIBUTES.has(key), `${name} ${key}`).toBe(true)
    }
    const href = element.getAttribute('href')
    if (href !== null) expect(SAFE_PROTOCOLS.has(new URL(href).protocol), href).toBe(true)
  }
}

describe('release notes input', () => {
  it('keeps only allowed elements and safe links from any release notes HTML', () => {
    fc.assert(fc.property(fc.oneof(html, fc.string()), expectOnlySafeMarkup), { numRuns: 500 })
  })
})
