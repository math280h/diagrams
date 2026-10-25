import { execFileSync } from 'node:child_process'

const BUMPS = ['patch', 'minor', 'major']
const CHANNELS = ['beta', 'alpha']
const TAG = /^v(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta)\.(\d+))?$/
const CHANNEL_RANK = { alpha: 0, beta: 1, stable: 2 }
const USAGE = `Usage: pnpm release:tag <${[...BUMPS, ...CHANNELS].join('|')}|x.y.z|x.y.z-beta.n> [--dry-run]`

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()

function parse(tag) {
  const match = TAG.exec(tag)
  if (!match) return null
  const [, major, minor, patch, channel, number] = match
  return {
    tag,
    core: [Number(major), Number(minor), Number(patch)],
    channel: channel ?? 'stable',
    number: number ? Number(number) : 0,
  }
}

function compare(a, b) {
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] - b.core[index]
  }
  return CHANNEL_RANK[a.channel] - CHANNEL_RANK[b.channel] || a.number - b.number
}

function format(core, channel, number) {
  return `v${core.join('.')}${channel === 'stable' ? '' : `-${channel}.${number}`}`
}

function nextTag(request, versions) {
  if (request.startsWith('v') || /^\d/.test(request)) {
    const tag = request.startsWith('v') ? request : `v${request}`
    if (!parse(tag)) throw new Error(`${request} is not a version such as 1.2.3 or 1.2.3-beta.1.\n${USAGE}`)
    return tag
  }
  const stable = versions.filter((version) => version.channel === 'stable').at(-1)
  const core = stable ? [...stable.core] : [0, 0, 0]
  if (BUMPS.includes(request)) {
    const index = BUMPS.indexOf(request)
    core[2 - index] += 1
    core.fill(0, 3 - index)
    return format(core, 'stable', 0)
  }
  if (!CHANNELS.includes(request)) throw new Error(USAGE)
  const previews = versions.filter(
    (version) => version.channel !== 'stable' && (!stable || compare(version, stable) > 0),
  )
  const base = previews.at(-1)?.core ?? [core[0], core[1], core[2] + 1]
  const same = previews.filter((version) => version.channel === request && version.core.join('.') === base.join('.'))
  return format(base, request, (same.at(-1)?.number ?? 0) + 1)
}

function release(request, dryRun) {
  git('fetch', '--quiet', '--tags', 'origin', 'main')
  const versions = git('tag', '--list', 'v*').split('\n').map(parse).filter(Boolean).toSorted(compare)
  const tag = nextTag(request, versions)
  const latest = versions.at(-1)
  if (versions.some((version) => version.tag === tag)) throw new Error(`The tag ${tag} exists already.`)
  if (latest && compare(parse(tag), latest) <= 0)
    throw new Error(`${tag} is not higher than the latest tag ${latest.tag}.`)
  if (dryRun) return `The next tag is ${tag}.`

  if (git('branch', '--show-current') !== 'main') throw new Error('Switch to main first.')
  if (git('status', '--porcelain')) throw new Error('Commit or stash your changes first.')
  if (git('rev-parse', 'HEAD') !== git('rev-parse', 'origin/main'))
    throw new Error('Pull main first: it differs from origin.')
  git('tag', '--annotate', tag, '--message', `Diagrams ${tag.slice(1)}`)
  git('push', 'origin', tag)
  const repository = git('remote', 'get-url', 'origin')
    .replace(/\.git$/, '')
    .replace(/^git@github\.com:/, 'https://github.com/')
  return `Pushed ${tag}. Follow the release at ${repository}/actions/workflows/release.yml`
}

const [request] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
try {
  if (!request) throw new Error(USAGE)
  console.log(release(request, process.argv.includes('--dry-run')))
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
