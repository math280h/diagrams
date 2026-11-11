/** The options of a build, from the `DIAGRAMS_*` environment variables at build time. */
export interface BuildConfig {
  /** The origin of the website that the desktop app trusts at its first start, and of the link preview tags. */
  website: string
  /** The GitHub repository with the releases, as `owner/name`. */
  repository: string
  /** True if a user can change the repository of updates in the desktop app. */
  repositoryEditable: boolean
  /** The client ID of the GitHub App for the GitHub sign-in of the desktop app, or `null` for no sign-in. */
  githubApp: string | null
}

export const OFFICIAL_WEBSITE = 'https://draw.thias.dev'
export const OFFICIAL_REPOSITORY = 'math280h/diagrams'

export const OFFICIAL_BUILD: BuildConfig = {
  website: OFFICIAL_WEBSITE,
  repository: OFFICIAL_REPOSITORY,
  repositoryEditable: false,
  githubApp: null,
}

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]'])
const REPOSITORY_PATTERN = /^[a-z\d](?:[a-z\d-]{0,38})\/(?!\.\.?$)[\w.-]{1,100}$/i
const GITHUB_URL_PREFIX = /^(?:https?:\/\/)?(?:www\.)?github\.com\//i
const GITHUB_APP_CLIENT_ID_PATTERN = /^Iv[\w.]{4,62}$/
const SWITCH_VALUES: ReadonlySet<string> = new Set(['1', 'true'])

/**
 * Returns the origin of a website address, or `null` if the desktop app does not accept it. The app accepts `https://`,
 * and `http://` only on this computer. An address without a scheme gets `https://`. The path is ignored.
 */
export function websiteOrigin(text: string): string | null {
  const trimmed = text.trim()
  let url: URL
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  if (url.username || url.password || !url.hostname) return null
  if (url.protocol === 'https:') return url.origin
  return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname) ? url.origin : null
}

/**
 * Returns the `owner/name` of a GitHub repository, or `null` for text that does not name one. It also accepts the
 * address of the repository on GitHub.
 */
export function repositoryName(text: string): string | null {
  const name = text
    .trim()
    .replace(GITHUB_URL_PREFIX, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/, '')
  return REPOSITORY_PATTERN.test(name) ? name : null
}

function setValue(env: Record<string, string | undefined>, name: string): string | null {
  const value = env[name]?.trim()
  return value ? value : null
}

/**
 * Reads the build options from the environment. A missing or empty variable gives the value of the official build.
 *
 * @throws Error If a variable has a value that the build cannot use.
 */
export function readBuildConfig(env: Record<string, string | undefined>): BuildConfig {
  const websiteText = setValue(env, 'DIAGRAMS_WEBSITE')
  const website = websiteText === null ? OFFICIAL_WEBSITE : websiteOrigin(websiteText)
  if (website === null) {
    throw new Error(
      `DIAGRAMS_WEBSITE must be an https:// address, or http:// on this computer. It is "${websiteText}".`,
    )
  }
  const repositoryText = setValue(env, 'DIAGRAMS_REPOSITORY')
  const repository = repositoryText === null ? OFFICIAL_REPOSITORY : repositoryName(repositoryText)
  if (repository === null) {
    throw new Error(`DIAGRAMS_REPOSITORY must be a GitHub repository as owner/name. It is "${repositoryText}".`)
  }
  const editableText = setValue(env, 'DIAGRAMS_REPOSITORY_EDITABLE')
  if (editableText !== null && !SWITCH_VALUES.has(editableText) && editableText !== '0' && editableText !== 'false') {
    throw new Error(`DIAGRAMS_REPOSITORY_EDITABLE must be 1 or 0. It is "${editableText}".`)
  }
  const githubApp = setValue(env, 'DIAGRAMS_GITHUB_APP')
  if (githubApp !== null && !GITHUB_APP_CLIENT_ID_PATTERN.test(githubApp)) {
    throw new Error(`DIAGRAMS_GITHUB_APP must be the client ID of a GitHub App, such as Iv23li…. It is "${githubApp}".`)
  }
  return {
    website,
    repository,
    repositoryEditable: editableText !== null && SWITCH_VALUES.has(editableText),
    githubApp,
  }
}

/** Returns the Vite `define` entries that put the build options into the bundle as {@link BUILD}. */
export function buildDefine(config: BuildConfig): Record<string, string> {
  return { DIAGRAMS_BUILD_CONFIG: JSON.stringify(config) }
}

declare const DIAGRAMS_BUILD_CONFIG: BuildConfig | undefined

/** The options of this build. Outside a Vite build, for example in a Node script, the options of the official build. */
export const BUILD: BuildConfig = typeof DIAGRAMS_BUILD_CONFIG === 'undefined' ? OFFICIAL_BUILD : DIAGRAMS_BUILD_CONFIG

/** Returns the addresses of a GitHub repository with releases. */
export function releaseLinks(repository: string) {
  const page = `https://github.com/${repository}`
  const api = `https://api.github.com/repos/${repository}`
  return {
    page,
    /** GitHub redirects this address to the newest published release that is not a pre-release. */
    latestRelease: `${page}/releases/latest`,
    releases: `${page}/releases`,
    /** The start of each download address of a release file. */
    assetPrefix: `${page}/releases/download/`,
    latestReleaseApi: `${api}/releases/latest`,
    releasesApi: `${api}/releases?per_page=30`,
    api,
    releaseTag: (version: string) => `${page}/releases/tag/v${version}`,
  }
}

export type ReleaseLinks = ReturnType<typeof releaseLinks>

/** The release addresses of the repository of this build. */
export const BUILD_RELEASES: ReleaseLinks = releaseLinks(BUILD.repository)
