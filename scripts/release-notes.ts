import type { Plugin } from 'vite'
import { RELEASES_API_URL } from '../src/desktop/constants.ts'

const MODULE_ID = 'virtual:release-notes'
const RESOLVED_ID = `\0${MODULE_ID}`
const LOOKUP_TIMEOUT_MS = 15_000
const KEPT_FIELDS = ['tag_name', 'name', 'draft', 'prerelease', 'published_at', 'body_html', 'html_url']

/**
 * Loads the GitHub releases with their notes as HTML, with only the fields that the What's new page reads.
 *
 * @param token - A GitHub token. Without it, GitHub allows 60 requests an hour from each address.
 * @throws Error If GitHub does not answer, or does not answer with a list.
 */
export async function fetchReleaseNotes(token?: string, fetchImpl: typeof fetch = fetch): Promise<unknown[]> {
  const response = await fetchImpl(RELEASES_API_URL, {
    headers: {
      Accept: 'application/vnd.github.html+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`GitHub answered with status ${response.status}.`)
  const data: unknown = await response.json()
  if (!Array.isArray(data)) throw new Error('GitHub did not answer with a list of releases.')
  return data.map((release: Record<string, unknown>) =>
    Object.fromEntries(KEPT_FIELDS.map((field) => [field, release[field]])),
  )
}

/**
 * Creates a Vite plugin that puts the GitHub release notes into the `virtual:release-notes` module.
 *
 * A build loads them once, with the `GITHUB_TOKEN` environment variable when it is set. The module holds `null` on the
 * dev server, and after a build cannot load them.
 */
export function releaseNotes(): Plugin {
  let isBuild = false
  let notes: Promise<unknown[] | null> | null = null
  return {
    name: 'release-notes',
    configResolved(config) {
      isBuild = config.command === 'build'
    },
    resolveId(source) {
      return source === MODULE_ID ? RESOLVED_ID : null
    },
    async load(id) {
      if (id !== RESOLVED_ID) return null
      if (!isBuild) return 'export default null'
      notes ??= fetchReleaseNotes(process.env.GITHUB_TOKEN).catch((error: unknown) => {
        this.warn(`The build has no release notes. ${error instanceof Error ? error.message : String(error)}`)
        return null
      })
      return `export default ${JSON.stringify(await notes)}`
    },
  }
}
