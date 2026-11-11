import { describe, expect, it, vi } from 'vitest'
import { checkUpdateRepository, updateFileName } from './update-repository'

function answering(status: number, body: unknown = {}) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => Response.json(body, { status }))
}

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
    ).rejects.toThrow('GitHub has no release in acme/none. A private repository needs a GitHub sign-in.')
    await expect(
      checkUpdateRepository('acme/none', { token: 't', platform: 'win32', fetch: answering(404) }),
    ).rejects.toThrow('GitHub has no release in acme/none that you can read.')
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
