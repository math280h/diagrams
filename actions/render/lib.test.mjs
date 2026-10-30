import { describe, expect, it } from 'vitest'
import {
  COMMENT_MARKER,
  commentBody,
  imagePath,
  imageUrl,
  parseNameStatus,
  parsePatterns,
  pathspecs,
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
