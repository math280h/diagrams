import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('virtual:release-notes', () => ({
  default: [{ tag_name: 'v0.2.0', published_at: '2026-10-28T09:00:00Z', body_html: '<p>Notes</p>' }],
  unreleased: {
    base: 'v0.2.0',
    changes: [
      { title: 'Pin nodes', pullRequest: 21, sha: 'b2', committedAt: Date.parse('2026-10-29T10:00:00Z') },
      { title: 'Share links', pullRequest: 20, sha: 'a1', committedAt: Date.parse('2026-10-29T09:00:00Z') },
    ],
  },
}))

const { loadReleases, nextRelease } = await import('./releases')

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('loadReleases', () => {
  it('reads the notes of the build and does not ask GitHub', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect((await loadReleases()).map((release) => release.tag)).toEqual(['v0.2.0'])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('puts the changes on main first on the preview site', async () => {
    vi.stubEnv('VITE_RELEASE_CHANNEL', 'preview')
    const [next, release] = await loadReleases()
    expect(next).toMatchObject({
      tag: 'main',
      name: 'Next release',
      preview: true,
      publishedAt: Date.parse('2026-10-29T10:00:00Z'),
      url: 'https://github.com/math280h/diagrams/compare/v0.2.0...main',
    })
    expect(next?.unreleased?.changes.map((change) => change.title)).toEqual(['Pin nodes', 'Share links'])
    expect(release?.tag).toBe('v0.2.0')
  })

  it('makes no entry when main has no changes after the newest release', () => {
    expect(nextRelease({ base: 'v0.2.0', changes: [] })).toBeNull()
  })
})
