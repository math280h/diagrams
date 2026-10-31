import { describe, expect, it } from 'vitest'
import { noticeText, readNoticeText, styleSheetImports } from './third-party-licenses.ts'

describe('third-party licences', () => {
  it('finds the packages that a style sheet imports, and leaves out local files and comments', () => {
    const css = [
      "@import 'tailwindcss';",
      '@import "tw-animate-css";',
      "@import 'shadcn/tailwind.css';",
      "@import url('@xyflow/react/dist/base.css');",
      "@plugin '@tailwindcss/typography';",
      "@import './styles/canvas.css';",
      "@import 'https://example.com/font.css';",
      "/* @import 'commented-out'; */",
    ].join('\n')
    expect(styleSheetImports(css)).toEqual([
      'tailwindcss',
      'tw-animate-css',
      'shadcn',
      '@xyflow/react',
      '@tailwindcss/typography',
    ])
  })

  it('reads the packages and the programs inside packages back from the notice text', () => {
    const text = noticeText([
      { name: '@hpcc-js/wasm-graphviz', version: '1.30.0', license: 'Apache-2.0', source: null, texts: ['Apache'] },
      {
        name: 'Graphviz',
        version: 'in @hpcc-js/wasm-graphviz 1.30.0',
        license: 'EPL-2.0',
        source: 'https://gitlab.com/graphviz/graphviz',
        texts: ['='.repeat(80), 'not a package 1.0.0', 'Eclipse Public License'],
      },
      { name: 'zod', version: '4.6.7', license: 'MIT', source: null, texts: [] },
    ])
    expect(readNoticeText(text)).toEqual([
      { name: '@hpcc-js/wasm-graphviz', version: '1.30.0' },
      { name: 'Graphviz', holder: { name: '@hpcc-js/wasm-graphviz', version: '1.30.0' } },
      { name: 'zod', version: '4.6.7' },
    ])
  })
})
