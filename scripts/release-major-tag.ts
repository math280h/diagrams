import { execFileSync } from 'node:child_process'
import { majorOf } from './release-formats.ts'

const USAGE = 'Usage: pnpm release:major-tag [vX.Y.Z] [--dry-run]'
const STABLE_CORE = /^v(\d+)\.(\d+)\.(\d+)$/

export interface PublishedRelease {
  tagName: string
  isDraft: boolean
  isPrerelease: boolean
}

function core(tag: string): number[] {
  return (STABLE_CORE.exec(tag) ?? []).slice(1).map(Number)
}

function compareStable(a: string, b: string): number {
  const [left, right] = [core(a), core(b)]
  for (let index = 0; index < 3; index += 1) {
    const order = (left[index] ?? 0) - (right[index] ?? 0)
    if (order !== 0) return order
  }
  return 0
}

/**
 * Chooses the release that the major tag of the render action points at.
 *
 * @param releases - The releases of the repository, also drafts and pre-releases.
 * @param request - The tag of a release. Without it, the newest stable release.
 * @returns The tag of the release and its major tag, for example `v1`.
 * @throws Error If the release is missing, a draft or a pre-release, or is not the newest stable release of its major
 *   version.
 */
export function majorTagRelease(
  releases: readonly PublishedRelease[],
  request?: string,
): { tag: string; majorTag: string } {
  const stable = releases
    .filter((release) => !release.isDraft && !release.isPrerelease && majorOf(release.tagName) !== null)
    .map((release) => release.tagName)
    .toSorted(compareStable)
  const tag = request ?? stable.at(-1)
  if (!tag) throw new Error('There is no published stable release.')
  const release = releases.find((candidate) => candidate.tagName === tag)
  if (!release) throw new Error(`${tag} has no release.`)
  if (release.isDraft) throw new Error(`${tag} is a draft. Publish it first.`)
  const major = majorOf(tag)
  if (release.isPrerelease || major === null) {
    throw new Error(`${tag} is a pre-release. Only a stable release moves the major tag.`)
  }
  const newest = stable.filter((candidate) => majorOf(candidate) === major).at(-1)
  if (newest !== tag) throw new Error(`${newest} is newer than ${tag}, so v${major} stays at ${newest}.`)
  return { tag, majorTag: `v${major}` }
}

/**
 * Reads the commit of a tag from the output of `git ls-remote`.
 *
 * @returns The commit that an annotated tag points at, not the tag object, or null if the output has no such tag.
 */
export function tagCommit(lsRemote: string, tag: string): string | null {
  const refs = new Map(
    lsRemote
      .split('\n')
      .map((line) => line.trim().split('\t'))
      .filter((fields): fields is [string, string] => fields.length === 2)
      .map(([sha, name]) => [name, sha]),
  )
  return refs.get(`refs/tags/${tag}^{}`) ?? refs.get(`refs/tags/${tag}`) ?? null
}

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim()

function moveMajorTag(request: string | undefined, dryRun: boolean): string {
  const repository = git('remote', 'get-url', 'origin')
    .replace(/\.git$/, '')
    .replace(/^(?:git@github\.com:|https:\/\/github\.com\/)/, '')
  const releases = JSON.parse(
    execFileSync(
      'gh',
      ['release', 'list', '--repo', repository, '--limit', '1000', '--json', 'tagName,isDraft,isPrerelease'],
      { encoding: 'utf8' },
    ),
  ) as PublishedRelease[]
  const { tag, majorTag } = majorTagRelease(releases, request)
  const refs = git('ls-remote', '--tags', 'origin')
  const commit = tagCommit(refs, tag)
  if (!commit) throw new Error(`origin has no tag ${tag}.`)
  if (tagCommit(refs, majorTag) === commit) return `${majorTag} points at ${tag} already.`
  if (dryRun) return `${majorTag} moves to ${tag} (${commit}).`
  git('tag', '--force', '--annotate', majorTag, commit, '--message', `Diagrams ${tag.slice(1)}`)
  git('push', '--force', 'origin', `refs/tags/${majorTag}`)
  return `Moved ${majorTag} to ${tag} (${commit}).`
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const [request, extra] = args.filter((arg) => !arg.startsWith('--'))
  try {
    if (extra !== undefined) throw new Error(USAGE)
    console.log(moveMajorTag(request, args.includes('--dry-run')))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
