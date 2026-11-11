import { readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { safeStorage } from 'electron'
import { z } from 'zod'
import type { GitHubSignIn } from '@/desktop/contract'

export const GITHUB_SIGN_IN_FILE = 'github-sign-in'
const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const TOKEN_URL = 'https://github.com/login/oauth/access_token'
const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'
const REQUEST_TIMEOUT_MS = 15_000
/** The app renews an access token this long before it expires. */
const RENEW_MARGIN_MS = 5 * 60_000
const SLOW_DOWN_STEP_S = 5
const EXPIRED = 'The GitHub sign-in expired. Sign in again.'
const CODE_EXPIRED = 'The code expired. Sign in again.'

/** Keeps one secret text, encrypted with the keychain of the system. */
export interface SecretStore {
  read(): string | null
  /** Returns false if the system has no keychain, so the store keeps nothing. */
  write(text: string): boolean
  remove(): void
}

/**
 * Returns a {@link SecretStore} in a file, encrypted with Electron `safeStorage`. Without a keychain it keeps nothing.
 */
export function secretFile(file: string): SecretStore {
  // On Linux without a secret service, safeStorage uses a fixed key ("basic_text"). That key gives no protection.
  const canKeep = () =>
    safeStorage.isEncryptionAvailable() &&
    (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text')
  return {
    read() {
      if (!canKeep()) return null
      try {
        return safeStorage.decryptString(readFileSync(file))
      } catch {
        return null
      }
    },
    write(text) {
      if (!canKeep()) {
        rmSync(file, { force: true })
        return false
      }
      try {
        mkdirSync(path.dirname(file), { recursive: true })
        writeFileSync(file, safeStorage.encryptString(text))
        return true
      } catch {
        return false
      }
    },
    remove() {
      rmSync(file, { force: true })
    },
  }
}

interface Tokens {
  accessToken: string
  /** In milliseconds since the epoch, or `null` for a token that does not expire. */
  accessExpiresAt: number | null
  refreshToken: string | null
  refreshExpiresAt: number | null
}

const STORED_TOKENS = z.object({
  accessToken: z.string().min(1),
  accessExpiresAt: z.number().nullable(),
  refreshToken: z.string().min(1).nullable(),
  refreshExpiresAt: z.number().nullable(),
})

const TOKEN_ANSWER = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive().optional(),
  refresh_token: z.string().min(1).optional(),
  refresh_token_expires_in: z.number().positive().optional(),
})

const ERROR_ANSWER = z.object({
  error: z.string(),
  error_description: z.string().optional(),
  interval: z.number().positive().optional(),
})

const DEVICE_CODE_ANSWER = z.object({
  device_code: z.string().min(1),
  user_code: z.string().min(1),
  verification_uri: z.url({ protocol: /^https$/ }),
  expires_in: z.number().positive(),
  interval: z.number().positive(),
})

export interface GitHubAuth {
  info(): GitHubSignIn
  /** Starts the device flow, or returns the sign-in that waits for the user. */
  signIn(): Promise<GitHubSignIn>
  cancelSignIn(): GitHubSignIn
  signOut(): GitHubSignIn
  /**
   * Returns an access token, renewed first if it expires soon, or `null` while the user is not signed in.
   *
   * @throws Error If GitHub does not answer the renewal. The sign-in stays.
   */
  accessToken(): Promise<string | null>
}

/**
 * Signs the user in to GitHub with the device flow of a GitHub App, and keeps the tokens in a {@link SecretStore}.
 * The device flow and its renewal need no client secret.
 *
 * @param clientId - The client ID of the GitHub App.
 * @param emit - Receives each change of the sign-in.
 */
export function createGitHubAuth(options: {
  clientId: string
  store: SecretStore
  emit: (info: GitHubSignIn) => void
  fetch?: typeof fetch
  now?: () => number
  wait?: (ms: number, signal: AbortSignal) => Promise<void>
}): GitHubAuth {
  const { clientId, store, emit } = options
  const fetchImpl = options.fetch ?? fetch
  const now = options.now ?? Date.now
  const wait =
    options.wait ??
    ((ms, signal) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms)
        signal.addEventListener('abort', () => {
          clearTimeout(timer)
          resolve()
        })
      }))

  let tokens = loadTokens()
  let kept = true
  let info: GitHubSignIn = tokens ? { state: 'signed-in', kept } : { state: 'signed-out', message: null }
  let polling: AbortController | null = null
  let renewing: Promise<string | null> | null = null

  function loadTokens(): Tokens | null {
    const text = store.read()
    if (text === null) return null
    try {
      return STORED_TOKENS.parse(JSON.parse(text))
    } catch {
      store.remove()
      return null
    }
  }

  function publish(next: GitHubSignIn) {
    info = next
    emit(info)
    return info
  }

  function keep(answer: z.infer<typeof TOKEN_ANSWER>) {
    const time = now()
    tokens = {
      accessToken: answer.access_token,
      accessExpiresAt: answer.expires_in === undefined ? null : time + answer.expires_in * 1000,
      refreshToken: answer.refresh_token ?? null,
      refreshExpiresAt:
        answer.refresh_token_expires_in === undefined ? null : time + answer.refresh_token_expires_in * 1000,
    }
    kept = store.write(JSON.stringify(tokens))
    return publish({ state: 'signed-in', kept })
  }

  function signedOut(message: string | null) {
    polling?.abort()
    polling = null
    tokens = null
    store.remove()
    return publish({ state: 'signed-out', message })
  }

  async function post(url: string, fields: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, ...fields }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
        : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const data: unknown = await response.json().catch(() => null)
    if (!response.ok && !ERROR_ANSWER.safeParse(data).success) {
      throw new Error(`GitHub answered with status ${response.status}.`)
    }
    return data
  }

  function errorText(data: unknown, fallback: string) {
    const error = ERROR_ANSWER.safeParse(data)
    return error.success ? (error.data.error_description ?? error.data.error) : fallback
  }

  async function poll(deviceCode: string, intervalS: number, expiresAt: number, signal: AbortSignal) {
    let interval = intervalS
    while (!signal.aborted && now() < expiresAt) {
      await wait(interval * 1000, signal)
      if (signal.aborted) return
      let data: unknown
      try {
        data = await post(TOKEN_URL, { device_code: deviceCode, grant_type: DEVICE_GRANT_TYPE }, signal)
      } catch {
        continue
      }
      if (signal.aborted) return
      const token = TOKEN_ANSWER.safeParse(data)
      if (token.success) {
        polling = null
        keep(token.data)
        return
      }
      const error = ERROR_ANSWER.safeParse(data).data?.error
      if (error === 'authorization_pending') continue
      if (error === 'slow_down') {
        interval = ERROR_ANSWER.parse(data).interval ?? interval + SLOW_DOWN_STEP_S
        continue
      }
      if (error === 'expired_token') break
      signedOut(
        error === 'access_denied'
          ? 'The sign-in was cancelled on GitHub.'
          : errorText(data, 'GitHub did not accept the sign-in.'),
      )
      return
    }
    if (!signal.aborted) signedOut(CODE_EXPIRED)
  }

  async function renew(current: Tokens): Promise<string | null> {
    if (!current.refreshToken || (current.refreshExpiresAt !== null && current.refreshExpiresAt <= now())) {
      signedOut(EXPIRED)
      return null
    }
    let data: unknown
    try {
      data = await post(TOKEN_URL, { grant_type: 'refresh_token', refresh_token: current.refreshToken })
    } catch {
      throw new Error('Could not reach GitHub to renew the sign-in.')
    }
    const token = TOKEN_ANSWER.safeParse(data)
    if (!token.success) {
      signedOut(EXPIRED)
      return null
    }
    keep(token.data)
    return token.data.access_token
  }

  return {
    info: () => info,
    async signIn() {
      if (info.state === 'waiting') return info
      polling?.abort()
      const controller = new AbortController()
      polling = controller
      let data: unknown
      try {
        data = await post(DEVICE_CODE_URL, {}, controller.signal)
      } catch {
        if (polling === controller) polling = null
        return publish({ state: 'signed-out', message: 'Could not reach GitHub.' })
      }
      const code = DEVICE_CODE_ANSWER.safeParse(data)
      if (polling !== controller) return info
      if (!code.success) {
        polling = null
        return publish({ state: 'signed-out', message: errorText(data, 'GitHub did not start the sign-in.') })
      }
      void poll(code.data.device_code, code.data.interval, now() + code.data.expires_in * 1000, controller.signal)
      return publish({ state: 'waiting', userCode: code.data.user_code, verificationUri: code.data.verification_uri })
    },
    cancelSignIn() {
      if (info.state !== 'waiting') return info
      polling?.abort()
      polling = null
      return publish(tokens ? { state: 'signed-in', kept } : { state: 'signed-out', message: null })
    },
    signOut: () => signedOut(null),
    accessToken() {
      const current = tokens
      if (!current) return Promise.resolve(null)
      if (current.accessExpiresAt === null || current.accessExpiresAt - now() > RENEW_MARGIN_MS) {
        return Promise.resolve(current.accessToken)
      }
      renewing ??= renew(current).finally(() => {
        renewing = null
      })
      return renewing
    },
  }
}
