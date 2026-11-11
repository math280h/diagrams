import { releaseLinks } from '@/desktop/build-config'

const REQUEST_TIMEOUT_MS = 15_000

/** Returns the name of the update file that electron-builder writes for a system, as in `latest-mac.yml`. */
export function updateFileName(platform: NodeJS.Platform): string {
  if (platform === 'darwin') return 'latest-mac.yml'
  if (platform === 'linux') return 'latest-linux.yml'
  return 'latest.yml'
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
  const fetchImpl = options.fetch ?? fetch
  let response: Response
  try {
    response = await fetchImpl(releaseLinks(repository).latestReleaseApi, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(options.token && { Authorization: `Bearer ${options.token}` }),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    throw new Error('Could not reach GitHub.')
  }
  if (response.status === 404) {
    throw new Error(
      options.token
        ? `GitHub has no release in ${repository} that you can read.`
        : `GitHub has no release in ${repository}. A private repository needs a GitHub sign-in.`,
    )
  }
  if (!response.ok) throw new Error(`GitHub answered with status ${response.status}.`)
  const release = (await response.json().catch(() => null)) as { assets?: { name?: unknown }[] } | null
  const file = updateFileName(options.platform)
  if (!release?.assets?.some((asset) => asset.name === file)) {
    throw new Error(`The newest release of ${repository} has no update for this system (${file}).`)
  }
}
