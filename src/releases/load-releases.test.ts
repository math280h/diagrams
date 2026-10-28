import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('virtual:release-notes', () => ({
  default: [{ tag_name: 'v0.2.0', published_at: '2026-10-28T09:00:00Z', body_html: '<p>Notes</p>' }],
}))

const { loadReleases } = await import('./releases')

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loadReleases', () => {
  it('reads the notes of the build and does not ask GitHub', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect((await loadReleases()).map((release) => release.tag)).toEqual(['v0.2.0'])
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
