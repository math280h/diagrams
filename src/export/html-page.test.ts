import { describe, expect, it } from 'vitest'
import { createDiagram } from '@/model/defaults'
import { PAGE_DATA_IDS } from '@/standalone/page-data'
import { fontFaceRule, pageHtml } from './html-page'

function parts(name: string) {
  return {
    diagram: { ...createDiagram(name), nodes: [] },
    icons: { sets: [], lucide: {} },
    script: 'const end = "</script>"; window.ready = true',
    style: '.a::after { content: "</style>" }',
    fontCss: '',
    licenses: 'A licence that mentions </SCRIPT> and <!-- a comment',
  }
}

function scriptText(html: string, id: string): string {
  const match = new RegExp(`<script type="application/json" id="${id}">(.*?)</script>`, 's').exec(html)
  return match?.[1] ?? ''
}

describe('pageHtml', () => {
  it('keeps text that closes an element inside its script and style elements', () => {
    const html = pageHtml(parts('Orders </script><script>alert(1)</script>'))
    expect(html).toContain('<title>Orders &lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;</title>')
    expect(html.match(/<\/script>/g)).toHaveLength(4)
    expect(html.match(/<\/style>/g)).toHaveLength(2)
    expect(html).toContain('const end = "<\\/script>"')
    expect(html).toContain('<\\/SCRIPT>')
  })

  it('carries the diagram as JSON that parses back to the same diagram', () => {
    const input = parts('A < B & "C"')
    const html = pageHtml(input)
    expect(JSON.parse(scriptText(html, PAGE_DATA_IDS.diagram))).toEqual(input.diagram)
    expect(scriptText(html, PAGE_DATA_IDS.diagram)).not.toContain('<')
  })
})

describe('fontFaceRule', () => {
  it('writes a rule with the weight range and the unicode range', () => {
    expect(
      fontFaceRule({
        family: 'Inter Variable',
        weight: '100 900',
        unicodeRange: 'U+0000-00FF',
        dataUrl: 'data:font/woff2;base64,AA',
      }),
    ).toBe(
      "@font-face{font-family:'Inter Variable';font-style:normal;font-display:swap;font-weight:100 900;src:url(data:font/woff2;base64,AA) format('woff2');unicode-range:U+0000-00FF}",
    )
  })
})
