import { describe, expect, it } from 'vitest'
import { parseReleases } from './releases'

describe('parseReleases', () => {
  it('keeps published releases that are not previews, the newest first', () => {
    const releases = parseReleases([
      {
        tag_name: 'v0.1.1',
        name: 'v0.1.1',
        published_at: '2026-10-20T10:00:00Z',
        body_html: '<p>a</p>',
        html_url: 'https://github.com/math280h/diagrams/releases/tag/v0.1.1',
      },
      { tag_name: 'v0.2.0-beta.1', prerelease: true, published_at: '2026-10-26T10:00:00Z' },
      { tag_name: 'v0.2.0', draft: true },
      { tag_name: 'v0.1.2', name: '', published_at: '2026-10-25T10:00:00Z', html_url: 'https://evil.example/x' },
      { name: 'no tag' },
    ])
    expect(releases.map((release) => [release.tag, release.name, release.url])).toEqual([
      ['v0.1.2', 'v0.1.2', 'https://github.com/math280h/diagrams/releases/tag/v0.1.2'],
      ['v0.1.1', 'v0.1.1', 'https://github.com/math280h/diagrams/releases/tag/v0.1.1'],
    ])
  })

  it('reads anything that is not a list as no releases', () => {
    expect(parseReleases({ message: 'API rate limit exceeded' })).toEqual([])
  })

  it('lists on the preview site the pre-releases that are newer than the newest full release', () => {
    const data = [
      { tag_name: 'v0.2.0-beta.2', prerelease: true, published_at: '2026-10-30T10:00:00Z' },
      { tag_name: 'v0.1.2', published_at: '2026-10-25T10:00:00Z' },
      { tag_name: 'v0.1.2-beta.1', prerelease: true, published_at: '2026-10-22T10:00:00Z' },
      { tag_name: 'v0.1.1', published_at: '2026-10-20T10:00:00Z' },
    ]
    expect(parseReleases(data, true).map((release) => [release.tag, release.preview])).toEqual([
      ['v0.2.0-beta.2', true],
      ['v0.1.2', false],
      ['v0.1.1', false],
    ])
    expect(parseReleases(data).map((release) => release.tag)).toEqual(['v0.1.2', 'v0.1.1'])
  })
})
