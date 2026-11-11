import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GitHubSignIn } from '@/desktop/contract'
import { createGitHubAuth, secretFile, type SecretStore } from './github-auth'

const safeStorage = vi.hoisted(() => ({
  isEncryptionAvailable: vi.fn(() => true),
  getSelectedStorageBackend: vi.fn(() => 'gnome_libsecret'),
  encryptString: vi.fn((text: string) => Buffer.from(`sealed:${text}`)),
  decryptString: vi.fn((data: Buffer) => data.toString().replace(/^sealed:/, '')),
}))
vi.mock('electron', () => ({ safeStorage }))

const HOUR_S = 3600
const DEVICE_CODE = {
  device_code: 'device-1',
  user_code: 'WDJB-MJHT',
  verification_uri: 'https://github.com/login/device',
  expires_in: 900,
  interval: 5,
}

function memoryStore(text: string | null = null, keeps = true): SecretStore & { text: string | null } {
  return {
    text,
    read() {
      return this.text
    },
    write(next) {
      if (keeps) this.text = next
      return keeps
    },
    remove() {
      this.text = null
    },
  }
}

function setup(options: { store?: SecretStore; answers?: unknown[] } = {}) {
  let time = 1_000_000
  const answers = [...(options.answers ?? [])]
  const requests: { url: string; fields: Record<string, string> }[] = []
  const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
    const fields = init?.body instanceof URLSearchParams ? init.body : new URLSearchParams()
    requests.push({ url: url instanceof Request ? url.url : url.toString(), fields: Object.fromEntries(fields) })
    const answer = answers.shift()
    if (answer instanceof Error) throw answer
    if (answer === undefined) throw new Error('No answer left.')
    return Response.json(answer)
  })
  const waits: number[] = []
  const emitted: GitHubSignIn[] = []
  const store = options.store ?? memoryStore()
  const auth = createGitHubAuth({
    clientId: 'Iv23liClient',
    store,
    emit: (info) => emitted.push(info),
    fetch,
    now: () => time,
    wait: async (ms) => {
      waits.push(ms)
      time += ms
    },
  })
  return { auth, store, requests, waits, emitted, advance: (ms: number) => (time += ms) }
}

function tokenAnswer(access: string, refresh: string) {
  return {
    access_token: access,
    expires_in: 8 * HOUR_S,
    refresh_token: refresh,
    refresh_token_expires_in: 4380 * HOUR_S,
    token_type: 'bearer',
  }
}

describe('createGitHubAuth', () => {
  it('signs in with the device flow, waits as GitHub asks, and keeps the tokens', async () => {
    const { auth, store, requests, waits, emitted } = setup({
      answers: [
        DEVICE_CODE,
        { error: 'authorization_pending' },
        { error: 'slow_down', interval: 10 },
        tokenAnswer('access-1', 'refresh-1'),
      ],
    })
    expect(await auth.signIn()).toEqual({
      state: 'waiting',
      userCode: 'WDJB-MJHT',
      verificationUri: 'https://github.com/login/device',
    })
    await vi.waitFor(() => expect(auth.info()).toEqual({ state: 'signed-in', kept: true }))
    expect(waits).toEqual([5000, 5000, 10_000])
    expect(requests[0]).toEqual({ url: 'https://github.com/login/device/code', fields: { client_id: 'Iv23liClient' } })
    expect(requests[1]).toEqual({
      url: 'https://github.com/login/oauth/access_token',
      fields: {
        client_id: 'Iv23liClient',
        device_code: 'device-1',
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      },
    })
    expect(JSON.parse(store.read()!)).toMatchObject({ accessToken: 'access-1', refreshToken: 'refresh-1' })
    expect(emitted.map((info) => info.state)).toEqual(['waiting', 'signed-in'])
    expect(await auth.accessToken()).toBe('access-1')
  })

  it('says why the sign-in ended when the user refuses it or the code expires', async () => {
    const refused = setup({ answers: [DEVICE_CODE, { error: 'access_denied' }] })
    await refused.auth.signIn()
    await vi.waitFor(() =>
      expect(refused.auth.info()).toEqual({ state: 'signed-out', message: 'The sign-in was cancelled on GitHub.' }),
    )
    const expired = setup({ answers: [DEVICE_CODE, { error: 'expired_token' }] })
    await expired.auth.signIn()
    await vi.waitFor(() =>
      expect(expired.auth.info()).toEqual({ state: 'signed-out', message: 'The code expired. Sign in again.' }),
    )
  })

  it('passes on the reason when GitHub does not start the sign-in', async () => {
    const { auth } = setup({
      answers: [{ error: 'device_flow_disabled', error_description: 'Device Flow must be explicitly enabled.' }],
    })
    expect(await auth.signIn()).toEqual({ state: 'signed-out', message: 'Device Flow must be explicitly enabled.' })
    const offline = setup({ answers: [new Error('offline')] })
    expect(await offline.auth.signIn()).toEqual({ state: 'signed-out', message: 'Could not reach GitHub.' })
  })

  it('stops the sign-in when the user cancels it', async () => {
    const { auth, requests } = setup({ answers: [DEVICE_CODE] })
    await auth.signIn()
    expect(auth.cancelSignIn()).toEqual({ state: 'signed-out', message: null })
    const sent = requests.length
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(requests).toHaveLength(sent)
    expect(auth.info()).toEqual({ state: 'signed-out', message: null })
  })

  it('renews an access token that expires soon, keeps the new refresh token, and shares one renewal', async () => {
    const store = memoryStore(
      JSON.stringify({
        accessToken: 'access-1',
        accessExpiresAt: 1_000_000 + 8 * HOUR_S * 1000,
        refreshToken: 'refresh-1',
        refreshExpiresAt: null,
      }),
    )
    const { auth, requests, advance } = setup({ store, answers: [tokenAnswer('access-2', 'refresh-2')] })
    expect(auth.info()).toEqual({ state: 'signed-in', kept: true })
    expect(await auth.accessToken()).toBe('access-1')
    advance(8 * HOUR_S * 1000 - 60_000)
    const [first, second] = await Promise.all([auth.accessToken(), auth.accessToken()])
    expect([first, second]).toEqual(['access-2', 'access-2'])
    expect(requests).toEqual([
      {
        url: 'https://github.com/login/oauth/access_token',
        fields: { client_id: 'Iv23liClient', grant_type: 'refresh_token', refresh_token: 'refresh-1' },
      },
    ])
    expect(JSON.parse(store.read()!)).toMatchObject({ accessToken: 'access-2', refreshToken: 'refresh-2' })
  })

  it('signs out when GitHub refuses the renewal, and keeps the sign-in when GitHub does not answer', async () => {
    const tokens = JSON.stringify({ accessToken: 'a', accessExpiresAt: 0, refreshToken: 'r', refreshExpiresAt: null })
    const offline = setup({ store: memoryStore(tokens), answers: [new Error('offline')] })
    await expect(offline.auth.accessToken()).rejects.toThrow('Could not reach GitHub to renew the sign-in.')
    expect(offline.auth.info().state).toBe('signed-in')

    const store = memoryStore(tokens)
    const refused = setup({ store, answers: [{ error: 'bad_refresh_token' }] })
    expect(await refused.auth.accessToken()).toBeNull()
    expect(refused.auth.info()).toEqual({
      state: 'signed-out',
      message: 'The GitHub sign-in expired. Sign in again.',
    })
    expect(store.read()).toBeNull()
  })

  it('uses a token that does not expire as it is', async () => {
    const store = memoryStore(
      JSON.stringify({ accessToken: 'forever', accessExpiresAt: null, refreshToken: null, refreshExpiresAt: null }),
    )
    const { auth, requests, advance } = setup({ store })
    advance(1000 * HOUR_S * 1000)
    expect(await auth.accessToken()).toBe('forever')
    expect(requests).toEqual([])
  })

  it('forgets damaged tokens, and signs out', async () => {
    const store = memoryStore('{ not json')
    const { auth } = setup({ store })
    expect(auth.info()).toEqual({ state: 'signed-out', message: null })
    expect(store.read()).toBeNull()
    expect(await auth.accessToken()).toBeNull()

    const signedIn = setup({
      store: memoryStore(
        JSON.stringify({ accessToken: 'a', accessExpiresAt: null, refreshToken: null, refreshExpiresAt: null }),
      ),
    })
    expect(signedIn.auth.signOut()).toEqual({ state: 'signed-out', message: null })
    expect(signedIn.store.read()).toBeNull()
  })

  it('tells the user when the system cannot keep the sign-in', async () => {
    const { auth } = setup({
      store: memoryStore(null, false),
      answers: [DEVICE_CODE, tokenAnswer('access-1', 'refresh-1')],
    })
    await auth.signIn()
    await vi.waitFor(() => expect(auth.info()).toEqual({ state: 'signed-in', kept: false }))
  })
})

describe('secretFile', () => {
  const folders: string[] = []
  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
    safeStorage.isEncryptionAvailable.mockReturnValue(true)
    safeStorage.getSelectedStorageBackend.mockReturnValue('gnome_libsecret')
  })

  function file() {
    const folder = mkdtempSync(path.join(tmpdir(), 'secret-file-'))
    folders.push(folder)
    return path.join(folder, 'user-data', 'secret')
  }

  it('keeps the text encrypted with the keychain', () => {
    const target = file()
    const store = secretFile(target)
    expect(store.write('token')).toBe(true)
    expect(readFileSync(target, 'utf8')).toBe('sealed:token')
    expect(store.read()).toBe('token')
    store.remove()
    expect(store.read()).toBeNull()
  })

  it('keeps nothing without a keychain', () => {
    const store = secretFile(file())
    safeStorage.isEncryptionAvailable.mockReturnValue(false)
    expect(store.write('token')).toBe(false)
    expect(store.read()).toBeNull()
  })

  it.runIf(process.platform === 'linux')('keeps nothing when Linux has only the fixed key', () => {
    safeStorage.getSelectedStorageBackend.mockReturnValue('basic_text')
    expect(secretFile(file()).write('token')).toBe(false)
  })
})
