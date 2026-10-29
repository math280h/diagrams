import { afterEach, describe, expect, it, vi } from 'vitest'

const { DOWNLOADS, PREVIEW } = vi.hoisted(() => {
  const downloads = 'https://github.com/math280h/diagrams/releases/download'
  return { DOWNLOADS: downloads, PREVIEW: `${downloads}/preview-57` }
})

vi.mock('virtual:release-notes', () => ({
  default: [
    { tag_name: 'v0.2.0', published_at: '2026-10-28T09:00:00Z', body_html: '<p>Notes</p>' },
    {
      tag_name: 'preview-58',
      draft: true,
      prerelease: true,
      assets: [{ name: 'Diagrams-preview-win-x64.exe', browser_download_url: `${DOWNLOADS}/preview-58/a.exe` }],
    },
    {
      tag_name: 'preview-56',
      prerelease: true,
      published_at: '2026-10-29T10:30:00Z',
      assets: [{ name: 'Diagrams-preview-win-x64.exe', browser_download_url: `${DOWNLOADS}/preview-56/a.exe` }],
    },
    {
      tag_name: 'preview-57',
      prerelease: true,
      published_at: '2026-10-29T11:00:00Z',
      assets: [
        {
          name: 'Diagrams-preview-linux-amd64.deb',
          browser_download_url: `${PREVIEW}/Diagrams-preview-linux-amd64.deb`,
        },
        { name: 'Diagrams-preview-win-x64.exe', browser_download_url: `${PREVIEW}/Diagrams-preview-win-x64.exe` },
        {
          name: 'Diagrams-preview-mac-x64.dmg',
          browser_download_url: 'https://example.com/Diagrams-preview-mac-x64.dmg',
        },
        {
          name: 'Diagrams-preview-mac-arm64.dmg',
          browser_download_url: `${DOWNLOADS}/preview-56/Diagrams-preview-mac-arm64.dmg`,
        },
        { name: 'latest.yml', browser_download_url: `${PREVIEW}/latest.yml` },
      ],
    },
  ],
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
    expect(next?.downloads).toEqual([
      { label: 'Windows', url: `${PREVIEW}/Diagrams-preview-win-x64.exe` },
      { label: 'Linux (deb)', url: `${PREVIEW}/Diagrams-preview-linux-amd64.deb` },
    ])
    expect(release?.tag).toBe('v0.2.0')
  })

  it('makes no entry when main has no changes after the newest release', () => {
    expect(nextRelease({ base: 'v0.2.0', changes: [] })).toBeNull()
  })
})
