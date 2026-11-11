const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const REQUEST_TIMEOUT_MS = 15_000

function text(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

/**
 * Checks that GitHub starts a device flow sign-in for the GitHub App of `DIAGRAMS_GITHUB_APP`. The code that GitHub
 * gives expires without use.
 *
 * @throws Error If GitHub does not answer, does not know the client ID, or the app has no device flow.
 */
export async function checkGitHubApp(clientId: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  let response: Response
  try {
    response = await fetchImpl(DEVICE_CODE_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    throw new Error('Could not reach GitHub to check DIAGRAMS_GITHUB_APP.')
  }
  const answer: unknown = await response.json().catch(() => null)
  const fields: Record<string, unknown> = answer !== null && typeof answer === 'object' ? { ...answer } : {}
  if (response.ok && text(fields.device_code)) return
  const reason = text(fields.error_description) ?? text(fields.error) ?? `status ${response.status}`
  throw new Error(
    `GitHub does not start a sign-in for DIAGRAMS_GITHUB_APP ${clientId} (${reason}). Check the client ID, and turn ` +
      'on "Enable Device Flow" in the settings of the GitHub App.',
  )
}
