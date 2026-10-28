import { describe, expect, it, vi } from 'vitest'
import { RELEASES_API_URL } from '../src/desktop/constants.ts'
import { fetchReleaseNotes } from './release-notes.ts'

describe('release notes at build time', () => {
  it('asks for HTML notes and keeps the fields that the page reads', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json([
        {
          tag_name: 'v0.2.0',
          name: 'v0.2.0',
          prerelease: false,
          published_at: '2026-10-28T09:00:00Z',
          body_html: '<p>Notes</p>',
          html_url: 'https://github.com/math280h/diagrams/releases/tag/v0.2.0',
          body: 'Notes',
          author: { login: 'someone' },
          assets: [{ name: 'Diagrams-Setup.exe' }],
        },
      ]),
    )
    const notes = await fetchReleaseNotes(fetchImpl)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(RELEASES_API_URL)
    expect(init.headers).toEqual({ Accept: 'application/vnd.github.html+json' })
    expect(notes).toEqual([
      {
        tag_name: 'v0.2.0',
        name: 'v0.2.0',
        draft: undefined,
        prerelease: false,
        published_at: '2026-10-28T09:00:00Z',
        body_html: '<p>Notes</p>',
        html_url: 'https://github.com/math280h/diagrams/releases/tag/v0.2.0',
      },
    ])
  })

  it('fails on an error answer', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ message: 'API rate limit exceeded' }, { status: 403 }))
    await expect(fetchReleaseNotes(fetchImpl)).rejects.toThrow('GitHub answered with status 403.')
  })
})
