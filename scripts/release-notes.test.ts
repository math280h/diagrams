import { describe, expect, it, vi } from 'vitest'
import { RELEASES_API_URL, REPOSITORY_API_URL } from '../src/desktop/constants.ts'
import { fetchReleaseNotes, fetchUnreleased, newestReleaseTag } from './release-notes.ts'

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

  it('finds the newest published release, a pre-release too', () => {
    expect(
      newestReleaseTag([
        { tag_name: 'v0.1.4', published_at: '2026-10-26T16:03:52Z' },
        { tag_name: 'v0.2.0', draft: true, published_at: '2026-10-29T10:00:00Z' },
        { tag_name: 'v0.2.0-beta.1', prerelease: true, published_at: '2026-10-28T10:00:00Z' },
        { tag_name: 'v0.1.3', published_at: '2026-10-26T04:53:53Z' },
      ]),
    ).toBe('v0.2.0-beta.1')
    expect(newestReleaseTag([])).toBeNull()
  })

  it('lists the commits on main after a release, the newest first, without merge commits', async () => {
    const commit = (sha: string, message: string, date: string) => ({
      sha,
      commit: { message, committer: { date } },
    })
    const fetchImpl = vi.fn(async () =>
      Response.json({
        commits: [
          commit('a1', 'Play a trace as a flow (#14)\n\nBody text', '2026-10-27T23:37:24Z'),
          commit('b2', "Merge branch 'main' into feature", '2026-10-28T01:00:00Z'),
          commit('c3', 'Fix a typo in the README', '2026-10-28T02:00:00Z'),
          commit('d4', 'Show a flow as a sequence diagram (#17)', '2026-10-28T02:13:12Z'),
        ],
      }),
    )
    expect(await fetchUnreleased('v0.1.4', fetchImpl)).toEqual({
      base: 'v0.1.4',
      changes: [
        {
          title: 'Show a flow as a sequence diagram',
          pullRequest: 17,
          sha: 'd4',
          committedAt: Date.parse('2026-10-28T02:13:12Z'),
        },
        {
          title: 'Fix a typo in the README',
          pullRequest: null,
          sha: 'c3',
          committedAt: Date.parse('2026-10-28T02:00:00Z'),
        },
        {
          title: 'Play a trace as a flow',
          pullRequest: 14,
          sha: 'a1',
          committedAt: Date.parse('2026-10-27T23:37:24Z'),
        },
      ],
    })
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe(`${REPOSITORY_API_URL}/compare/v0.1.4...main`)
  })
})
