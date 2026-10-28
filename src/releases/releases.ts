import { RELEASES_API_URL, REPOSITORY_URL } from '@/desktop/constants'

const LOOKUP_TIMEOUT_MS = 8000

export interface Release {
  tag: string
  name: string
  /** The time of publication, in milliseconds since the epoch. */
  publishedAt: number
  /** The release notes as HTML from GitHub, before {@link cleanReleaseHtml}. */
  html: string
  url: string
}

interface GitHubRelease {
  tag_name?: unknown
  name?: unknown
  draft?: unknown
  prerelease?: unknown
  published_at?: unknown
  body_html?: unknown
  html_url?: unknown
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Returns the published releases that are not pre-releases, the newest first. */
export function parseReleases(data: unknown): Release[] {
  if (!Array.isArray(data)) return []
  return (data as GitHubRelease[])
    .filter((release) => release.draft !== true && release.prerelease !== true && text(release.tag_name))
    .map((release) => {
      const tag = text(release.tag_name)
      const url = text(release.html_url)
      return {
        tag,
        name: text(release.name) || tag,
        publishedAt: Date.parse(text(release.published_at)) || 0,
        html: text(release.body_html),
        url: url.startsWith(`${REPOSITORY_URL}/releases/`) ? url : `${REPOSITORY_URL}/releases/tag/${tag}`,
      }
    })
    .toSorted((a, b) => b.publishedAt - a.publishedAt)
}

export class ReleaseLookupError extends Error {}

/**
 * Loads the release notes from GitHub.
 *
 * @throws ReleaseLookupError If GitHub does not answer or answers with an error.
 */
export async function loadReleases(): Promise<Release[]> {
  let response: Response
  try {
    response = await fetch(RELEASES_API_URL, {
      headers: { Accept: 'application/vnd.github.html+json' },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    })
  } catch {
    throw new ReleaseLookupError('GitHub did not answer.')
  }
  if (!response.ok) throw new ReleaseLookupError(`GitHub answered with status ${response.status}.`)
  return parseReleases(await response.json())
}
