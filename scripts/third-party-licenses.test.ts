import { describe, expect, it } from 'vitest'
import { noticeText, readNoticeText } from './third-party-licenses.ts'

describe('third-party licences', () => {
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
