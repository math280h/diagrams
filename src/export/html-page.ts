import type { Diagram } from '@/model/schema'
import { PAGE_DATA_IDS, type PageIcons } from '@/standalone/page-data'

export interface PageParts {
  diagram: Diagram
  icons: PageIcons
  /** The player script, which reads the diagram and the icons from the page. */
  script: string
  style: string
  /** The `@font-face` rules with the font files as data URLs. */
  fontCss: string
  licenses: string
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (character) => HTML_ESCAPES[character]!)
}

// An HTML parser ends a script or style element at the first `</script` or `</style`, also inside a string.
function inRawText(text: string, element: 'script' | 'style'): string {
  return text.replace(new RegExp(`</(${element})`, 'gi'), '<\\/$1')
}

function jsonInScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

/** Returns an `@font-face` rule for a font file. */
export function fontFaceRule(font: { family: string; weight: string; unicodeRange: string; dataUrl: string }): string {
  return `@font-face{font-family:'${font.family}';font-style:normal;font-display:swap;font-weight:${font.weight};src:url(${font.dataUrl}) format('woff2');unicode-range:${font.unicodeRange}}`
}

/** Returns a page that plays the diagram without a network connection. */
export function pageHtml(parts: PageParts): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="generator" content="Diagrams">',
    `<title>${escapeHtml(parts.diagram.name)}</title>`,
    `<style>${inRawText(parts.fontCss, 'style')}</style>`,
    `<style>${inRawText(parts.style, 'style')}</style>`,
    '</head>',
    '<body>',
    '<div id="root"></div>',
    `<script type="application/json" id="${PAGE_DATA_IDS.diagram}">${jsonInScript(parts.diagram)}</script>`,
    `<script type="application/json" id="${PAGE_DATA_IDS.icons}">${jsonInScript(parts.icons)}</script>`,
    `<script>${inRawText(parts.script, 'script')}</script>`,
    `<script type="text/plain" id="third-party-licenses">${inRawText(parts.licenses, 'script')}</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n')
}
