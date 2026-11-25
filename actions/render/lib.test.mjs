import { describe, expect, it } from 'vitest'
import {
  COMMENT_MARKER,
  commentBody,
  compareVersions,
  imagePath,
  imageUrl,
  parseNameStatus,
  parsePatterns,
  parseRefs,
  parseThemes,
  parseVersion,
  pathspecs,
  releaseForRef,
  renderOptions,
  splitCommand,
} from './lib.mjs'

describe('render action', () => {
  it('reads the patterns and the app command', () => {
    expect(parsePatterns('docs/**/*.diagram.json\r\n\n  diagrams/*.json  \n')).toEqual([
      'docs/**/*.diagram.json',
      'diagrams/*.json',
    ])
    expect(pathspecs(['**/*.diagram.json'])).toEqual([':(glob)**/*.diagram.json'])
    expect(splitCommand(' node_modules/.bin/electron  . ')).toEqual(['node_modules/.bin/electron', '.'])
  })

  it('puts the image next to the diagram file', () => {
    expect(imagePath('docs/orders.diagram.json', 'png')).toBe('docs/orders.png')
    expect(imagePath('orders.JSON', 'svg')).toBe('orders.svg')
  })

  it('names the image after the theme when the action renders several themes', () => {
    expect(parseThemes(' dark, light\nthemes/brand.theme.json ')).toEqual(['dark', 'light', 'themes/brand.theme.json'])
    expect(parseThemes('')).toEqual([])
    expect(imagePath('docs/orders.diagram.json', 'png', 'dark')).toBe('docs/orders.dark.png')
    expect(imagePath('docs/orders.diagram.json', 'svg', 'themes/brand.theme.json')).toBe('docs/orders.brand.svg')
  })

  it('passes only the options that are set to the app', () => {
    expect(renderOptions({ input: 'a.diagram.json', output: 'a.png', theme: '', maxSize: '' })).toEqual([
      '--render',
      'a.diagram.json',
      '--out',
      'a.png',
    ])
    expect(renderOptions({ input: 'a.json', output: 'a.svg', theme: 'light', maxSize: '1200' })).toEqual([
      '--render',
      'a.json',
      '--out',
      'a.svg',
      '--theme',
      'light',
      '--max-size',
      '1200',
    ])
  })

  it('reads the added, changed and removed diagrams of a pull request', () => {
    expect(
      parseNameStatus('A\tdocs/new.diagram.json\nM\tdocs/orders.diagram.json\nD\told.diagram.json\nT\tx.json\n'),
    ).toEqual([
      { kind: 'added', file: 'docs/new.diagram.json' },
      { kind: 'changed', file: 'docs/orders.diagram.json' },
      { kind: 'removed', file: 'old.diagram.json' },
      { kind: 'changed', file: 'x.json' },
    ])
  })

  it('writes a comment with the image before and after each change', () => {
    const body = commentBody({
      intro: 'The diagrams that this pull request changes, as of 0123456.',
      entries: [
        { file: 'docs/orders.diagram.json', before: 'https://x/before.png', after: 'https://x/after.png' },
        { file: 'docs/new.diagram.json', after: 'https://x/new.png' },
        { file: 'old.diagram.json', before: 'https://x/old.png' },
        { file: 'next.diagram.json', after: 'https://x/next.png', beforeNote: 'The base app cannot open it' },
      ],
    })
    expect(body.startsWith(COMMENT_MARKER)).toBe(true)
    expect(body).toContain('The diagrams that this pull request changes, as of 0123456.')
    expect(body).toContain(
      '| `next.diagram.json` | The base app cannot open it | <img src="https://x/next.png" alt="After" width="420"> |',
    )
    expect(body).toContain(
      '| `docs/orders.diagram.json` | <img src="https://x/before.png" alt="Before" width="420"> | <img src="https://x/after.png" alt="After" width="420"> |',
    )
    expect(body).toContain('| `docs/new.diagram.json` | New | <img src="https://x/new.png" alt="After" width="420"> |')
    expect(body).toContain('| `old.diagram.json` | <img src="https://x/old.png" alt="Before" width="420"> | Removed |')
  })

  it('shows the part of a tall image with the changes, and links the whole image', () => {
    const body = commentBody({
      intro: 'The diagrams that look different with this pull request, as of 0123456.',
      entries: [
        {
          file: 'app/library.dark.png',
          before: 'https://x/before.marked.png',
          after: 'https://x/after.marked.png',
          afterView: 'https://x/after.view.png',
        },
        {
          file: 'app/phone-library.dark.png',
          before: 'https://x/2/before.marked.png',
          after: 'https://x/2/after.marked.png',
          afterView: 'https://x/2/after.view.png',
          afterHidden: 3,
        },
      ],
    })
    expect(body).toContain(
      '| `app/library.dark.png` | <img src="https://x/before.marked.png" alt="Before" width="420"> | <img src="https://x/after.view.png" alt="After, part of the image" width="420"><br><a href="https://x/after.marked.png">Whole image</a> |',
    )
    expect(body).toContain('<a href="https://x/2/after.marked.png">Whole image, 3 more changes</a>')
  })

  it('writes a comment without a table when no diagram changed', () => {
    const intro = 'No diagram looks different with this pull request, as of 0123456.'
    const body = commentBody({ intro, entries: [] })
    expect(body).toBe([COMMENT_MARKER, '### Diagram images', '', intro, ''].join('\n'))
  })

  it('sorts version tags as semantic versions', () => {
    expect(parseVersion('v1.2.3-beta.1')).toEqual({ core: [1, 2, 3], prerelease: ['beta', '1'] })
    expect(parseVersion('v1')).toBeNull()
    expect(parseVersion('preview-57')).toBeNull()
    expect(
      ['v0.10.0', 'v0.2.0', 'v0.2.0-beta.2', 'v0.2.0-beta.10', 'v0.2.0-alpha.1', 'v1.0.0'].toSorted(compareVersions),
    ).toEqual(['v0.2.0-alpha.1', 'v0.2.0-beta.2', 'v0.2.0-beta.10', 'v0.2.0', 'v0.10.0', 'v1.0.0'])
  })

  it('reads the commit of each ref, also of an annotated tag', () => {
    const refs = parseRefs(
      [
        `${'a'.repeat(40)}\trefs/heads/main`,
        `${'b'.repeat(40)}\trefs/tags/v0.1.0`,
        `${'c'.repeat(40)}\trefs/tags/v0.1.0^{}`,
        '',
      ].join('\n'),
    )
    expect(refs.get('refs/heads/main')).toBe('a'.repeat(40))
    expect(refs.get('refs/tags/v0.1.0')).toBe('c'.repeat(40))
  })

  describe('chooses the release of the action ref', () => {
    const [old, release, beta, head, draft] = ['1', '2', '3', '4', '5'].map((digit) => digit.repeat(40))
    const refs = new Map([
      ['refs/tags/v0.1.0', old],
      ['refs/tags/v0.2.0', release],
      ['refs/tags/v0', release],
      ['refs/tags/v0.3.0-beta.1', beta],
      ['refs/tags/v0.3.0', draft],
      ['refs/heads/main', head],
      ['refs/heads/next', draft],
    ])
    const published = ['v0.3.0-beta.1', 'v0.2.0', 'v0.1.0']

    it('takes the release of a version tag', () => {
      expect(releaseForRef({ ref: 'v0.1.0', refs, published })).toEqual({ version: 'v0.1.0' })
      expect(releaseForRef({ ref: 'v0.3.0-beta.1', refs, published })).toEqual({ version: 'v0.3.0-beta.1' })
    })

    it('takes the release at the commit of a major tag or a commit SHA', () => {
      expect(releaseForRef({ ref: 'v0', refs, published })).toEqual({ version: 'v0.2.0' })
      expect(releaseForRef({ ref: release.toUpperCase(), refs, published })).toEqual({ version: 'v0.2.0' })
      expect(releaseForRef({ ref: beta, refs, published })).toEqual({ version: 'v0.3.0-beta.1' })
    })

    it('prefers a release to a preview at the same commit', () => {
      const same = new Map([...refs, ['refs/tags/v0.2.0-beta.1', release]])
      expect(releaseForRef({ ref: release, refs: same, published: [...published, 'v0.2.0-beta.1'] })).toEqual({
        version: 'v0.2.0',
      })
    })

    it('stops at a version tag that has no published release', () => {
      for (const ref of ['v0.3.0', draft]) {
        expect(releaseForRef({ ref, refs, published }).error).toBe(
          'Diagrams v0.3.0 has no published release yet. Run the job again after the release, or set the version input.',
        )
      }
    })

    it('gives the stable releases to search for a branch or another commit', () => {
      const stable = ['v0.2.0', 'v0.1.0']
      expect(releaseForRef({ ref: 'main', refs, published })).toEqual({ commit: head, candidates: stable })
      expect(releaseForRef({ ref: 'next', refs, published })).toEqual({ commit: draft, candidates: stable })
      expect(releaseForRef({ ref: 'f'.repeat(40), refs, published })).toEqual({
        commit: 'f'.repeat(40),
        candidates: stable,
      })
    })

    it('stops at an unknown ref or without a published release', () => {
      expect(releaseForRef({ ref: 'feature', refs, published }).error).toBe(
        'The action ref feature is not a tag, branch or commit of Diagrams. Set the version input.',
      )
      expect(releaseForRef({ ref: 'main', refs, published: [] }).error).toBe(
        'Diagrams has no published release. Set the version input.',
      )
    })
  })

  it('links an image on the preview branch', () => {
    expect(
      imageUrl({
        server: 'https://github.com',
        repository: 'acme/shop',
        branch: 'diagram-previews',
        file: 'pr-7/0123456/1/after.png',
      }),
    ).toBe('https://github.com/acme/shop/blob/diagram-previews/pr-7/0123456/1/after.png?raw=true')
  })
})
