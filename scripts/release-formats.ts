import { execFileSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { OLDEST_FORMAT, PREVIEW_FORMATS, RELEASE_MAJOR } from '../src/persistence/release-formats.ts'

/** The folders of the sample files that the format and container tests read. */
export const SAMPLE_FOLDERS = ['src/persistence/formats/', 'src/share/samples/', 'src/export/samples/']
const STABLE_TAG = /^v(\d+)\.(\d+)\.(\d+)$/
const FORMAT_FILE = /^src\/persistence\/formats\/v(\d+)\./
const IMAGE_FILE = /^src\/export\/samples\/v(\d+)\./
const HOW = 'See "Change the diagram format" in docs/ARCHITECTURE.md.'

export interface Release {
  tag: string
  /** The diagram format that the release writes. */
  format: number
}

export interface Policy {
  oldestFormat: number
  previewFormats: readonly number[]
  releaseMajor: number
}

/** Returns the major version of a release tag such as `v1.2.3`, or null for a preview tag or another tag. */
export function majorOf(tag: string): number | null {
  const match = STABLE_TAG.exec(tag)
  return match ? Number(match[1]) : null
}

/**
 * Checks that the code opens the diagrams of every earlier release of its major version.
 *
 * @param releases - The releases that have a tag, in any order.
 * @param newTag - The tag of the release that is about to start, if any.
 * @returns A sentence for each problem.
 */
export function releaseProblems(releases: readonly Release[], policy: Policy, newTag?: string): string[] {
  const problems: string[] = []
  const majors = releases.map((release) => majorOf(release.tag)!)
  const newestMajor = majors.length > 0 ? Math.max(...majors) : 0
  if (policy.releaseMajor < newestMajor || policy.releaseMajor > newestMajor + 1) {
    problems.push(
      `RELEASE_MAJOR is ${policy.releaseMajor}, but the newest release has the major version ${newestMajor}.`,
    )
  }
  if (newTag !== undefined) {
    const major = majorOf(newTag)
    if (major !== null && major !== policy.releaseMajor) {
      problems.push(`${newTag} has the major version ${major}, but RELEASE_MAJOR is ${policy.releaseMajor}.`)
    }
    if (major !== null && policy.releaseMajor > newestMajor && newTag !== `v${policy.releaseMajor}.0.0`) {
      problems.push(`RELEASE_MAJOR starts a new major version, so the next release is v${policy.releaseMajor}.0.0.`)
    }
  }
  for (const release of releases) {
    if (release.tag === newTag) continue
    if (policy.previewFormats.includes(release.format)) {
      problems.push(`PREVIEW_FORMATS holds format ${release.format}, but ${release.tag} wrote it.`)
    }
    if (majorOf(release.tag) === policy.releaseMajor && release.format < policy.oldestFormat) {
      problems.push(
        `${release.tag} wrote format ${release.format}, but OLDEST_FORMAT is ${policy.oldestFormat}. ` +
          `Only a new major version can stop to open it. ${HOW}`,
      )
    }
  }
  return problems
}

/**
 * Checks that no change edits or deletes a sample file that is on the base branch.
 *
 * @param changes - The lines of `git diff --name-status --no-renames` for the sample folders.
 * @param newMajor - True if `RELEASE_MAJOR` starts a new major version. Then the samples of formats older than
 *   `oldestFormat` can go.
 */
export function sampleProblems(changes: readonly string[], oldestFormat: number, newMajor: boolean): string[] {
  const problems: string[] = []
  for (const line of changes) {
    const [status, file] = line.split('\t')
    if (!status || !file || status === 'A') continue
    const format = Number((FORMAT_FILE.exec(file) ?? IMAGE_FILE.exec(file))?.[1] ?? Number.NaN)
    if (status === 'D' && newMajor && !(format >= oldestFormat)) continue
    const action = status === 'D' ? 'deletes' : 'changes'
    problems.push(`The change ${action} ${file}. A sample on main stays as it is; add a new file instead. ${HOW}`)
  }
  return problems
}

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim()

function formatAt(tag: string): number {
  const match = /DIAGRAM_VERSION = (\d+)/.exec(git('show', `${tag}:src/model/schema.ts`))
  if (!match) throw new Error(`src/model/schema.ts of ${tag} has no DIAGRAM_VERSION.`)
  return Number(match[1])
}

function main() {
  const { values } = parseArgs({ options: { tag: { type: 'string' }, base: { type: 'string' } } })
  const tags = git('tag', '--list', 'v*')
    .split('\n')
    .filter((tag) => majorOf(tag) !== null)
  if (tags.length === 0) throw new Error('There are no release tags. Fetch them with git fetch --tags.')
  const releases = tags.map((tag) => ({ tag, format: formatAt(tag) }))
  const policy = { oldestFormat: OLDEST_FORMAT, previewFormats: PREVIEW_FORMATS, releaseMajor: RELEASE_MAJOR }
  const problems = releaseProblems(releases, policy, values.tag)
  if (values.base) {
    const changes = git('diff', '--name-status', '--no-renames', values.base, 'HEAD', '--', ...SAMPLE_FOLDERS)
    const newMajor = RELEASE_MAJOR > Math.max(...tags.map((tag) => majorOf(tag)!))
    problems.push(...sampleProblems(changes.split('\n').filter(Boolean), OLDEST_FORMAT, newMajor))
  }
  for (const problem of problems) console.error(`::error::${problem}`)
  if (problems.length > 0) process.exit(1)
  const kept = releases.filter((release) => majorOf(release.tag) === RELEASE_MAJOR && release.tag !== values.tag)
  console.log(
    `The code opens the diagrams of every release of major version ${RELEASE_MAJOR}: ` +
      `${kept.map((release) => `${release.tag} (format ${release.format})`).join(', ') || 'none yet'}.`,
  )
}

if (import.meta.main) main()
