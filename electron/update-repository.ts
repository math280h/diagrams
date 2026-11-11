import { releaseLinks } from '@/desktop/build-config'
import type { UpdateFeed } from './updates'

const REQUEST_TIMEOUT_MS = 15_000

/** Returns the name of the update file that electron-builder writes for a system, as in `latest-mac.yml`. */
export function updateFileName(platform: NodeJS.Platform): string {
  if (platform === 'darwin') return 'latest-mac.yml'
  if (platform === 'linux') return 'latest-linux.yml'
  return 'latest.yml'
}

async function get(url: string, headers: Record<string, string>, fetchImpl: typeof fetch): Promise<Response> {
  try {
    return await fetchImpl(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  } catch {
    throw new Error('Could not reach GitHub.')
  }
}

function apiHeaders(token: string | null): Record<string, string> {
  return { Accept: 'application/vnd.github+json', ...(token && { Authorization: `Bearer ${token}` }) }
}

// GitHub answers 404 for a private repository that the request cannot read. Without a token, the API permits only
// 60 requests an hour from one address. The releases feed has no such limit.
async function canRead(repository: string, token: string | null, fetchImpl: typeof fetch): Promise<boolean> {
  const links = releaseLinks(repository)
  const response = token
    ? await get(links.api, apiHeaders(token), fetchImpl)
    : await get(`${links.releases}.atom`, {}, fetchImpl)
  await response.body?.cancel()
  if (response.status === 404) return false
  if (!response.ok) throw new Error(`GitHub answered with status ${response.status}.`)
  return true
}

/**
 * Returns the feed of a repository: with the token of the GitHub sign-in if the token can read the repository, else
 * without a token if the repository is public.
 *
 * @param accessToken - Returns the token of the GitHub sign-in, or `null` while the user is not signed in. `null` for a
 *   build without a GitHub sign-in.
 * @returns `sign-in` for a repository that only a GitHub sign-in can show.
 * @throws Error If GitHub does not answer, or the repository is not public and the token cannot read it.
 */
export async function repositoryFeed(
  repository: string,
  options: { accessToken: (() => Promise<string | null>) | null; fetch?: typeof fetch },
): Promise<UpdateFeed | 'sign-in'> {
  const fetchImpl = options.fetch ?? fetch
  const token = options.accessToken ? await options.accessToken() : null
  if (token !== null && (await canRead(repository, token, fetchImpl))) return { repository, token }
  if (await canRead(repository, null, fetchImpl)) return { repository, token: null }
  if (!options.accessToken) throw new Error(`GitHub has no public repository ${repository}.`)
  if (token === null) return 'sign-in'
  throw new Error(`GitHub has no repository ${repository} that your account can read.`)
}

/**
 * Checks that the newest release of a GitHub repository has an update for this system.
 *
 * @param token - A GitHub access token for a private repository, or `null`.
 * @throws Error If GitHub does not answer, the repository has no release, or the release has no update file.
 */
export async function checkUpdateRepository(
  repository: string,
  options: { token: string | null; platform: NodeJS.Platform; fetch?: typeof fetch },
): Promise<void> {
  const response = await get(
    releaseLinks(repository).latestReleaseApi,
    apiHeaders(options.token),
    options.fetch ?? fetch,
  )
  if (response.status === 404) throw new Error(`GitHub has no release in ${repository}.`)
  if (!response.ok) throw new Error(`GitHub answered with status ${response.status}.`)
  const release = (await response.json().catch(() => null)) as { assets?: { name?: unknown }[] } | null
  const file = updateFileName(options.platform)
  if (!release?.assets?.some((asset) => asset.name === file)) {
    throw new Error(`The newest release of ${repository} has no update for this system (${file}).`)
  }
}
