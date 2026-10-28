import builtReleases from 'virtual:release-notes'
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
  /** True for a pre-release, which only the preview website lists. */
  preview: boolean
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

/** Returns true on the preview website, which deploys `main` and also lists the newest pre-releases. */
export function isPreviewSite(): boolean {
  return import.meta.env.VITE_RELEASE_CHANNEL === 'preview'
}

/**
 * Returns the published releases, the newest first.
 *
 * @param previews - If true, the list also holds the pre-releases that are newer than the newest full release. A full
 *   release replaces the pre-releases before it.
 */
export function parseReleases(data: unknown, previews = false): Release[] {
  if (!Array.isArray(data)) return []
  const releases = (data as GitHubRelease[])
    .filter((release) => release.draft !== true && text(release.tag_name))
    .map((release): Release => {
      const tag = text(release.tag_name)
      const url = text(release.html_url)
      return {
        tag,
        name: text(release.name) || tag,
        publishedAt: Date.parse(text(release.published_at)) || 0,
        html: text(release.body_html),
        url: url.startsWith(`${REPOSITORY_URL}/releases/`) ? url : `${REPOSITORY_URL}/releases/tag/${tag}`,
        preview: release.prerelease === true,
      }
    })
    .toSorted((a, b) => b.publishedAt - a.publishedAt)
  const newestFull = releases.find((release) => !release.preview)?.publishedAt ?? 0
  return releases.filter((release) => !release.preview || (previews && release.publishedAt > newestFull))
}

export class ReleaseLookupError extends Error {}

/**
 * Returns the release notes of the build, or loads them from GitHub if the build has none.
 *
 * @throws ReleaseLookupError If GitHub does not answer or answers with an error.
 */
export async function loadReleases(): Promise<Release[]> {
  if (builtReleases) return parseReleases(builtReleases, isPreviewSite())
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
  return parseReleases(await response.json(), isPreviewSite())
}
