import type { Plugin } from 'vite'
import { RELEASES_API_URL, REPOSITORY_API_URL } from '../src/desktop/constants.ts'
import type { UnreleasedChange, UnreleasedChanges } from '../src/releases/unreleased.ts'

const MODULE_ID = 'virtual:release-notes'
const RESOLVED_ID = `\0${MODULE_ID}`
const LOOKUP_TIMEOUT_MS = 15_000
const KEPT_FIELDS = ['tag_name', 'name', 'draft', 'prerelease', 'published_at', 'body_html', 'html_url']
const PULL_REQUEST_SUFFIX = /\s*\(#(\d+)\)$/

interface GitHubCommit {
  sha?: unknown
  commit?: { message?: unknown; committer?: { date?: unknown } }
}

async function getJson(url: string, accept: string, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await fetchImpl(url, { headers: { Accept: accept }, signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`GitHub answered with status ${response.status}.`)
  return response.json()
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Loads the GitHub releases with their notes as HTML, with only the fields that the What's new page reads.
 *
 * @throws Error If GitHub does not answer, or does not answer with a list.
 */
export async function fetchReleaseNotes(fetchImpl: typeof fetch = fetch): Promise<unknown[]> {
  const data = await getJson(RELEASES_API_URL, 'application/vnd.github.html+json', fetchImpl)
  if (!Array.isArray(data)) throw new Error('GitHub did not answer with a list of releases.')
  return data.map((release: Record<string, unknown>) =>
    Object.fromEntries(KEPT_FIELDS.map((field) => [field, release[field]])),
  )
}

/** Returns the tag of the newest published release, a pre-release too, or `null` without one. */
export function newestReleaseTag(releases: unknown[]): string | null {
  const published = (releases as Record<string, unknown>[]).filter(
    (release) => release.draft !== true && typeof release.tag_name === 'string' && release.tag_name,
  )
  const time = (release: Record<string, unknown>) => Date.parse(String(release.published_at)) || 0
  const [newest] = published.toSorted((a, b) => time(b) - time(a))
  return newest ? String(newest.tag_name) : null
}

/**
 * Loads the commits on `main` after a release, without merge commits.
 *
 * @throws Error If GitHub does not answer, or does not answer with a comparison.
 */
export async function fetchUnreleased(base: string, fetchImpl: typeof fetch = fetch): Promise<UnreleasedChanges> {
  const data = (await getJson(
    `${REPOSITORY_API_URL}/compare/${encodeURIComponent(base)}...main`,
    'application/vnd.github+json',
    fetchImpl,
  )) as { commits?: unknown }
  if (!Array.isArray(data.commits)) throw new Error('GitHub did not answer with a comparison.')
  const changes = (data.commits as GitHubCommit[]).flatMap((entry): UnreleasedChange[] => {
    const message = typeof entry.commit?.message === 'string' ? entry.commit.message : ''
    const title = message.split('\n', 1)[0]!.trim()
    if (!title || title.startsWith('Merge ') || typeof entry.sha !== 'string') return []
    const pullRequest = PULL_REQUEST_SUFFIX.exec(title)
    return [
      {
        title: pullRequest ? title.slice(0, pullRequest.index) : title,
        pullRequest: pullRequest ? Number(pullRequest[1]) : null,
        sha: entry.sha,
        committedAt: Date.parse(String(entry.commit?.committer?.date)) || 0,
      },
    ]
  })
  return { base, changes: changes.toReversed() }
}

async function moduleSource(preview: boolean, warn: (message: string) => void): Promise<string> {
  const releases = await fetchReleaseNotes().catch((error: unknown) => {
    warn(`The build has no release notes. ${messageOf(error)}`)
    return null
  })
  const base = preview && releases ? newestReleaseTag(releases) : null
  const unreleased = base
    ? await fetchUnreleased(base).catch((error: unknown) => {
        warn(`The build has no changes after ${base}. ${messageOf(error)}`)
        return null
      })
    : null
  return `export default ${JSON.stringify(releases)}\nexport const unreleased = ${JSON.stringify(unreleased)}\n`
}

/**
 * Creates a Vite plugin that puts the GitHub release notes into the `virtual:release-notes` module.
 *
 * A build loads them once. With `VITE_RELEASE_CHANNEL=preview`, it also loads the commits on `main` after the newest
 * release. The module holds `null` on the dev server, and in place of what a build cannot load.
 */
export function releaseNotes(): Plugin {
  let isBuild = false
  let preview = false
  let source: Promise<string> | null = null
  return {
    name: 'release-notes',
    configResolved(config) {
      isBuild = config.command === 'build'
      preview = config.env.VITE_RELEASE_CHANNEL === 'preview'
    },
    resolveId(id) {
      return id === MODULE_ID ? RESOLVED_ID : null
    },
    load(id) {
      if (id !== RESOLVED_ID) return null
      if (!isBuild) return 'export default null\nexport const unreleased = null\n'
      source ??= moduleSource(preview, (message) => this.warn(message))
      return source
    },
  }
}
