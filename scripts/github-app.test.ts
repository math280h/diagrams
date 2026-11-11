import { describe, expect, it, vi } from 'vitest'
import { checkGitHubApp } from './github-app.ts'

function answering(status: number, body: unknown) {
  return vi.fn<typeof fetch>(async () => Response.json(body, { status }))
}

describe('checkGitHubApp', () => {
  it('accepts a GitHub App that starts a device flow', async () => {
    const fetch = answering(200, { device_code: 'd', user_code: 'ABCD-1234', interval: 5, expires_in: 900 })
    await checkGitHubApp('Iv23liExample', fetch)
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://github.com/login/device/code')
    expect(init?.method).toBe('POST')
    expect(init?.body).toEqual(new URLSearchParams({ client_id: 'Iv23liExample' }))
  })

  it('stops the build with the answer of GitHub', async () => {
    await expect(checkGitHubApp('Iv23liUnknown', answering(404, { error: 'Not Found' }))).rejects.toThrow(
      'GitHub does not start a sign-in for DIAGRAMS_GITHUB_APP Iv23liUnknown (Not Found). Check the client ID, and ' +
        'turn on "Enable Device Flow" in the settings of the GitHub App.',
    )
    await expect(
      checkGitHubApp(
        'Iv23liNoDevice',
        answering(400, { error: 'device_flow_disabled', error_description: 'Device Flow must be explicitly enabled' }),
      ),
    ).rejects.toThrow('(Device Flow must be explicitly enabled)')
    await expect(checkGitHubApp('Iv23liExample', answering(503, 'busy'))).rejects.toThrow('(status 503)')
  })

  it('stops the build when GitHub does not answer', async () => {
    const offline = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed')
    })
    await expect(checkGitHubApp('Iv23liExample', offline)).rejects.toThrow(
      'Could not reach GitHub to check DIAGRAMS_GITHUB_APP.',
    )
  })
})
