import { describe, expect, it } from 'vitest'
import { readmeImagePaths, readmeSnippet } from './readme'

describe('readme images', () => {
  it('names a dark and a light image after the path', () => {
    expect(readmeImagePaths(' docs/images/orders ', 'png')).toEqual({
      dark: 'docs/images/orders-dark.png',
      light: 'docs/images/orders-light.png',
    })
    expect(readmeImagePaths('orders.GIF', 'gif')).toEqual({ dark: 'orders-dark.gif', light: 'orders-light.gif' })
    expect(readmeImagePaths('', 'png').dark).toBe('diagram-dark.png')
  })

  it('writes a picture element that switches with the colour scheme', () => {
    const paths = readmeImagePaths('docs/my images/orders', 'gif')
    expect(readmeSnippet(paths, 'Shop. The "API" sends <orders> & more.')).toBe(
      [
        '<picture>',
        '  <source media="(prefers-color-scheme: dark)" srcset="docs/my%20images/orders-dark.gif">',
        '  <img src="docs/my%20images/orders-light.gif" alt="Shop. The &quot;API&quot; sends &lt;orders&gt; &amp; more.">',
        '</picture>',
        '',
      ].join('\n'),
    )
  })
})
