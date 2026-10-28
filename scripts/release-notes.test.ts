import { describe, expect, it, vi } from 'vitest'
import { RELEASES_API_URL } from '../src/desktop/constants.ts'
import { fetchReleaseNotes } from './release-notes.ts'

describe('release notes at build time', () => {
  it('asks for HTML notes with the token and keeps the fields that the page reads', async () => {
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
    const notes = await fetchReleaseNotes('secret', fetchImpl)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(RELEASES_API_URL)
    expect(init.headers).toEqual({ Accept: 'application/vnd.github.html+json', Authorization: 'Bearer secret' })
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

  it('sends no token without one, and fails on an error answer', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ message: 'API rate limit exceeded' }, { status: 403 }))
    await expect(fetchReleaseNotes(undefined, fetchImpl)).rejects.toThrow('GitHub answered with status 403.')
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.headers).toEqual({ Accept: 'application/vnd.github.html+json' })
  })
})
