import { describe, expect, it, vi } from 'vitest'
import { checkUpdateRepository, repositoryFeed, updateFileName } from './update-repository'

function answering(status: number, body: unknown = {}) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => Response.json(body, { status }))
}

function privateRepository(readers: string[]) {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const authorization = new Headers(init?.headers).get('Authorization')
    return Response.json({}, { status: readers.some((token) => authorization === `Bearer ${token}`) ? 200 : 404 })
  })
}

describe('repositoryFeed', () => {
  it('reads a public repository without a token, and does not ask for a sign-in', async () => {
    const fetch = answering(200)
    await expect(repositoryFeed('acme/public', { accessToken: async () => null, fetch })).resolves.toEqual({
      repository: 'acme/public',
      token: null,
    })
    expect(fetch.mock.calls.map(([url, init]) => [url, init?.headers])).toEqual([
      ['https://github.com/acme/public/releases.atom', {}],
    ])
  })

  it('asks for a sign-in only for a repository that GitHub hides without a token', async () => {
    const fetch = privateRepository(['token-1'])
    await expect(repositoryFeed('acme/private', { accessToken: async () => null, fetch })).resolves.toBe('sign-in')
    await expect(repositoryFeed('acme/private', { accessToken: async () => 'token-1', fetch })).resolves.toEqual({
      repository: 'acme/private',
      token: 'token-1',
    })
    expect(fetch).toHaveBeenLastCalledWith('https://api.github.com/repos/acme/private', {
      headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer token-1' },
      signal: expect.any(AbortSignal),
    })
  })

  it('reads a public repository without the token when the token cannot read it', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = input instanceof Request ? input.url : input.toString()
      return Response.json({}, { status: url.endsWith('.atom') ? 200 : 404 })
    })
    await expect(repositoryFeed('acme/public', { accessToken: async () => 'token-1', fetch })).resolves.toEqual({
      repository: 'acme/public',
      token: null,
    })
  })

  it('says when the account that signed in cannot read the repository', async () => {
    await expect(
      repositoryFeed('acme/private', { accessToken: async () => 'token-2', fetch: privateRepository(['token-1']) }),
    ).rejects.toThrow('GitHub has no repository acme/private that your account can read.')
  })

  it('does not mention a sign-in in a build without one', async () => {
    await expect(repositoryFeed('acme/private', { accessToken: null, fetch: privateRepository([]) })).rejects.toThrow(
      'GitHub has no public repository acme/private.',
    )
  })

  it('stops when GitHub does not answer', async () => {
    await expect(repositoryFeed('acme/web', { accessToken: null, fetch: answering(500) })).rejects.toThrow(
      'GitHub answered with status 500.',
    )
    const offline = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    await expect(repositoryFeed('acme/web', { accessToken: null, fetch: offline })).rejects.toThrow(
      'Could not reach GitHub.',
    )
  })
})

describe('checkUpdateRepository', () => {
  it('accepts a repository whose newest release has the update file of this system', async () => {
    const fetch = answering(200, { assets: [{ name: 'latest.yml' }, { name: 'latest-mac.yml' }] })
    await checkUpdateRepository('acme/diagrams', { token: null, platform: 'win32', fetch })
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://api.github.com/repos/acme/diagrams/releases/latest')
    expect(init?.headers).toEqual({ Accept: 'application/vnd.github+json' })
  })

  it('sends the token for a private repository', async () => {
    const fetch = answering(200, { assets: [{ name: 'latest-linux.yml' }] })
    await checkUpdateRepository('acme/private', { token: 'token-1', platform: 'linux', fetch })
    expect(fetch.mock.calls[0]![1]?.headers).toEqual({
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer token-1',
    })
  })

  it('says what is wrong with the repository', async () => {
    await expect(
      checkUpdateRepository('acme/none', { token: null, platform: 'win32', fetch: answering(404) }),
    ).rejects.toThrow('GitHub has no release in acme/none.')
    await expect(
      checkUpdateRepository('acme/web', { token: null, platform: 'darwin', fetch: answering(200, { assets: [] }) }),
    ).rejects.toThrow('The newest release of acme/web has no update for this system (latest-mac.yml).')
    await expect(
      checkUpdateRepository('acme/web', { token: null, platform: 'win32', fetch: answering(403) }),
    ).rejects.toThrow('GitHub answered with status 403.')
    const offline = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    await expect(checkUpdateRepository('acme/web', { token: null, platform: 'win32', fetch: offline })).rejects.toThrow(
      'Could not reach GitHub.',
    )
  })
})

describe('updateFileName', () => {
  it('names the update file of each system', () => {
    expect([updateFileName('win32'), updateFileName('darwin'), updateFileName('linux')]).toEqual([
      'latest.yml',
      'latest-mac.yml',
      'latest-linux.yml',
    ])
  })
})
