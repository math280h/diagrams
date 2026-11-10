import { CONNECT_AGENT_LINK, DEEP_LINK_SCHEME, RANDOM_KEY_PATTERN } from '@/desktop/constants'

const RECEIVE_HOST = 'receive'

function parseLink(url: string): { host: string; params: URLSearchParams } | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== `${DEEP_LINK_SCHEME}:`) return null
  const host = parsed.hostname || parsed.pathname.replace(/^\/+/, '').split('/')[0] || ''
  return { host, params: parsed.searchParams }
}

/** Returns the first argument with the {@link DEEP_LINK_SCHEME} scheme, or `null`. */
export function findDeepLink(argv: readonly string[]): string | null {
  return argv.find((arg) => arg.toLowerCase().startsWith(`${DEEP_LINK_SCHEME}:`)) ?? null
}

/**
 * Reads the handoff code from a `diagrams://receive?code=…` link.
 *
 * @returns The code, or `null` if the link is not a valid receive link.
 */
export function parseReceiveLink(url: string): string | null {
  const link = parseLink(url)
  if (link?.host !== RECEIVE_HOST) return null
  const code = link.params.get('code')
  return code && RANDOM_KEY_PATTERN.test(code) ? code : null
}

/** Returns true for a {@link CONNECT_AGENT_LINK}, also with a slash at the end. */
export function isConnectAgentLink(url: string): boolean {
  return parseLink(url)?.host === parseLink(CONNECT_AGENT_LINK)?.host
}
