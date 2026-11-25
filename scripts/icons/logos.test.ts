import { describe, expect, it } from 'vitest'
import { logoEntries, logosBySlug, withKeptLogos, type PackageLogo } from './logos.ts'
import type { KeptLogo } from './sources.ts'

const GO: PackageLogo = { slug: 'go', title: 'Go', path: 'M1 1h22', source: 'https://go.dev' }
const GONE: PackageLogo = {
  slug: 'gone',
  title: 'Gone Cloud',
  path: 'M2 2h20',
  source: 'https://gone.example',
  license: { type: 'CC-BY-4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
}
const CATALOG = { Languages: { form: 'service', slugs: 'go gone' } }
const KEPT_GONE: KeptLogo = {
  version: '16.38.0',
  title: 'Gone Cloud',
  path: 'M2 2h20',
  source: 'https://gone.example',
  license: { type: 'CC-BY-4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
}

describe('logosBySlug', () => {
  it('reads the logos of a package module by slug', () => {
    expect(logosBySlug({ siGo: GO, default: 'not a logo', other: null })).toEqual(new Map([['go', GO]]))
  })
})

describe('withKeptLogos', () => {
  it('keeps a catalog logo that the package no longer has, from the earlier version', () => {
    const current = new Map([['go', GO]])
    const earlier = new Map([
      ['go', GO],
      ['gone', GONE],
    ])
    expect(withKeptLogos(CATALOG, current, {}, earlier, '16.38.0')).toEqual({ gone: KEPT_GONE })
  })

  it('keeps the logos that it kept before', () => {
    const earlier = new Map([['go', GO]])
    const kept = withKeptLogos(CATALOG, new Map(), { gone: KEPT_GONE }, earlier, '17.0.0')
    expect(kept).toEqual({
      go: { version: '17.0.0', title: 'Go', path: 'M1 1h22', source: 'https://go.dev' },
      gone: KEPT_GONE,
    })
  })

  it('fails when the earlier version also does not have the logo', () => {
    expect(() => withKeptLogos(CATALOG, new Map([['go', GO]]), {}, new Map(), '16.38.0')).toThrow(
      'Simple Icons 16.38.0 has no gone either.',
    )
  })
})

describe('logoEntries', () => {
  it('makes an entry for each catalog logo, and retires a kept logo', () => {
    const entries = logoEntries(CATALOG, { go: 'golang' }, new Map([['go', GO]]), { gone: KEPT_GONE })
    expect(entries).toEqual([
      {
        id: 'logo:go',
        title: 'Go',
        category: 'Languages',
        form: 'service',
        aliases: ['go', 'golang'],
        keywords: ['go'],
        path: 'M1 1h22',
      },
      {
        id: 'logo:gone',
        title: 'Gone Cloud',
        category: 'Languages',
        form: 'service',
        aliases: ['gone', 'gone cloud'],
        keywords: ['gone', 'cloud'],
        path: 'M2 2h20',
        retired: true,
      },
    ])
  })

  it('takes the logo of the package when the package has it again', () => {
    const entries = logoEntries(
      CATALOG,
      {},
      new Map([
        ['go', GO],
        ['gone', GONE],
      ]),
      { gone: KEPT_GONE },
    )
    expect(entries.map((entry) => entry.retired)).toEqual([undefined, undefined])
  })

  it('tells how to keep a logo that the package no longer has', () => {
    expect(() => logoEntries(CATALOG, {}, new Map([['go', GO]]), {})).toThrow('pnpm icons logos --keep-from')
  })
})
