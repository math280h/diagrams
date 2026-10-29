import builtReleases, { unreleased } from 'virtual:release-notes'
import {
  PREVIEW_APP_TAG_PATTERN,
  RELEASE_ASSET_URL_PREFIX,
  RELEASES_API_URL,
  REPOSITORY_URL,
} from '@/desktop/constants'
import type { UnreleasedChanges } from './unreleased'

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
  /** Only on the entry of the preview website for the changes on `main` that no release has yet. */
  unreleased?: UnreleasedChanges
  /** With `unreleased`: the installers of the newest build of `main`. */
  downloads?: Download[]
}

export interface Download {
  label: string
  url: string
}

const PREVIEW_INSTALLERS: { label: string; pattern: RegExp }[] = [
  { label: 'Windows', pattern: /-win-x64\.exe$/ },
  { label: 'macOS (Apple silicon)', pattern: /-mac-arm64\.dmg$/ },
  { label: 'macOS (Intel)', pattern: /-mac-x64\.dmg$/ },
  { label: 'Linux (AppImage)', pattern: /\.AppImage$/ },
  { label: 'Linux (deb)', pattern: /\.deb$/ },
]

interface GitHubRelease {
  tag_name?: unknown
  name?: unknown
  draft?: unknown
  prerelease?: unknown
  published_at?: unknown
  body_html?: unknown
  html_url?: unknown
  assets?: { name?: unknown; browser_download_url?: unknown }[]
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isPreviewAppRelease(release: GitHubRelease): boolean {
  return PREVIEW_APP_TAG_PATTERN.test(text(release.tag_name))
}

function publishedAtMs(release: GitHubRelease): number {
  return Date.parse(text(release.published_at)) || 0
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
    .filter((release) => release.draft !== true && text(release.tag_name) && !isPreviewAppRelease(release))
    .map((release): Release => {
      const tag = text(release.tag_name)
      const url = text(release.html_url)
      return {
        tag,
        name: text(release.name) || tag,
        publishedAt: publishedAtMs(release),
        html: text(release.body_html),
        url: url.startsWith(`${REPOSITORY_URL}/releases/`) ? url : `${REPOSITORY_URL}/releases/tag/${tag}`,
        preview: release.prerelease === true,
      }
    })
    .toSorted((a, b) => b.publishedAt - a.publishedAt)
  const newestFull = releases.find((release) => !release.preview)?.publishedAt ?? 0
  return releases.filter((release) => !release.preview || (previews && release.publishedAt > newestFull))
}

/** Returns the installers on the pre-release of the newest build of `main`, in a fixed order. */
export function previewDownloads(data: unknown): Download[] {
  if (!Array.isArray(data)) return []
  const [preview] = (data as GitHubRelease[])
    .filter((release) => release.draft !== true && isPreviewAppRelease(release))
    .toSorted((a, b) => publishedAtMs(b) - publishedAtMs(a))
  const assets = (preview?.assets ?? []).filter(
    (asset): asset is { name: string; browser_download_url: string } =>
      typeof asset.name === 'string' &&
      typeof asset.browser_download_url === 'string' &&
      asset.browser_download_url.startsWith(`${RELEASE_ASSET_URL_PREFIX}${text(preview?.tag_name)}/`),
  )
  return PREVIEW_INSTALLERS.flatMap(({ label, pattern }) => {
    const asset = assets.find((candidate) => pattern.test(candidate.name))
    return asset ? [{ label, url: asset.browser_download_url }] : []
  })
}

/** Returns the entry for the changes on `main` after the newest release, or `null` without changes. */
export function nextRelease(changes: UnreleasedChanges, downloads: Download[] = []): Release | null {
  if (changes.changes.length === 0) return null
  return {
    tag: 'main',
    name: 'Next release',
    publishedAt: Math.max(...changes.changes.map((change) => change.committedAt)),
    html: '',
    url: `${REPOSITORY_URL}/compare/${encodeURIComponent(changes.base)}...main`,
    preview: true,
    unreleased: changes,
    downloads,
  }
}

export class ReleaseLookupError extends Error {}

/**
 * Returns the release notes of the build, or loads them from GitHub if the build has none.
 *
 * @throws ReleaseLookupError If GitHub does not answer or answers with an error.
 */
export async function loadReleases(): Promise<Release[]> {
  if (builtReleases) {
    const releases = parseReleases(builtReleases, isPreviewSite())
    const next = isPreviewSite() && unreleased ? nextRelease(unreleased, previewDownloads(builtReleases)) : null
    return next ? [next, ...releases] : releases
  }
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
