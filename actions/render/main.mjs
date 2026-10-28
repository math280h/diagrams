import { spawnSync } from 'node:child_process'
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import {
  COMMENT_MARKER,
  commentBody,
  imagePath,
  imageUrl,
  parseNameStatus,
  parsePatterns,
  pathspecs,
  renderOptions,
  splitCommand,
} from './lib.mjs'

const APP_REPOSITORY = 'math280h/diagrams'
const DEFAULT_PATTERN = '**/*.diagram.json'
const RENDER_TIMEOUT_MS = 5 * 60_000
const PUSH_ATTEMPTS = 3
const BOT_NAME = 'github-actions[bot]'
const BOT_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com'
const USERNS_SETTING = '/proc/sys/kernel/apparmor_restrict_unprivileged_userns'

const env = process.env
const inputs = {
  patterns: parsePatterns(env.INPUT_FILES || DEFAULT_PATTERN),
  format: env.INPUT_FORMAT || 'png',
  theme: env.INPUT_THEME ?? '',
  maxSize: env.INPUT_MAX_SIZE ?? '',
  mode: env.INPUT_MODE || 'auto',
  publish: env.INPUT_PUBLISH !== 'false',
  branch: env.INPUT_PREVIEW_BRANCH || 'diagram-previews',
  version: env.INPUT_VERSION || 'latest',
  app: env.INPUT_APP ?? '',
  token: env.INPUT_TOKEN ?? '',
}
const temp = env.RUNNER_TEMP || path.resolve('.diagrams-render')

class ActionError extends Error {}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options })
  if (result.error) throw new ActionError(`${command} did not start: ${result.error.message}`)
  if (result.status !== 0 && !options.allowFailure) {
    const name = options.name ?? `${command} ${args[0] ?? ''}`
    throw new ActionError(`${name} failed: ${(result.stderr || result.stdout || '').trim()}`)
  }
  return result
}

function setOutput(name, lines) {
  if (!env.GITHUB_OUTPUT) return
  const delimiter = `diagrams_${Date.now()}`
  appendFileSync(env.GITHUB_OUTPUT, `${name}<<${delimiter}\n${lines.join('\n')}\n${delimiter}\n`)
}

function summary(text) {
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${text}\n`)
  else console.log(text)
}

function installApp() {
  if (process.platform !== 'linux') {
    throw new ActionError('The action downloads Diagrams for Linux only. On another runner, set the app input.')
  }
  const folder = path.join(temp, 'diagrams-app')
  mkdirSync(folder, { recursive: true })
  run(
    'gh',
    [
      'release',
      'download',
      ...(inputs.version === 'latest' ? [] : [inputs.version]),
      '--repo',
      APP_REPOSITORY,
      '--pattern',
      '*-linux-x86_64.AppImage',
      '--dir',
      folder,
      '--clobber',
    ],
    { env: { ...env, GH_TOKEN: inputs.token } },
  )
  const image = readdirSync(folder).find((name) => name.endsWith('.AppImage'))
  if (!image) throw new ActionError(`The release ${inputs.version} has no Linux AppImage.`)
  chmodSync(path.join(folder, image), 0o755)
  // An extracted AppImage runs without FUSE, which GitHub runners do not have.
  run(path.join(folder, image), ['--appimage-extract'], { cwd: folder })
  console.log(`Installed ${image}.`)
  return [path.join(folder, 'squashfs-root', 'diagrams')]
}

function appCommand() {
  const command = inputs.app ? splitCommand(inputs.app) : installApp()
  if (process.platform !== 'linux') return command
  const prefix = []
  if (!env.DISPLAY) {
    if (run('which', ['xvfb-run'], { allowFailure: true }).status !== 0) {
      throw new ActionError('Chromium needs a display. Install xvfb, or set DISPLAY.')
    }
    prefix.push('xvfb-run', '--auto-servernum')
  }
  const flags = []
  if (existsSync(USERNS_SETTING) && readFileSync(USERNS_SETTING, 'utf8').trim() === '1') {
    console.log('This system does not allow unprivileged user namespaces, so Chromium runs without its sandbox.')
    flags.push('--no-sandbox')
  }
  return [...prefix, ...command, ...flags]
}

function render(command, input, output) {
  mkdirSync(path.dirname(output), { recursive: true })
  const [program, ...args] = command
  const result = run(
    program,
    [...args, ...renderOptions({ input, output, theme: inputs.theme, maxSize: inputs.maxSize })],
    { allowFailure: true, timeout: RENDER_TIMEOUT_MS },
  )
  if (result.status === 0) return
  const reason = result.signal
    ? `The app did not finish within ${RENDER_TIMEOUT_MS / 60_000} minutes. Use a Diagrams release with the command-line render.`
    : (result.stderr || result.stdout || '').trim()
  throw new ActionError(`${input}: ${reason}`)
}

function trackedDiagrams() {
  const out = run('git', ['ls-files', '-z', '--', ...pathspecs(inputs.patterns)]).stdout
  return out.split('\0').filter(Boolean)
}

function writeImages(command) {
  const files = trackedDiagrams()
  if (files.length === 0) console.log('No tracked file matches the files input.')
  const images = files.map((file) => {
    const image = imagePath(file, inputs.format)
    render(command, file, image)
    console.log(`Rendered ${file} to ${image}.`)
    return image
  })
  setOutput('images', images)
  if (images.length > 0) summary(['### Diagram images', '', ...images.map((image) => `- \`${image}\``)].join('\n'))
}

function ensureCommit(sha) {
  if (run('git', ['cat-file', '-e', `${sha}^{commit}`], { allowFailure: true }).status === 0) return
  run('git', ['fetch', '--no-tags', '--depth=1', 'origin', sha])
}

function gitWithToken(repo) {
  const credentials = Buffer.from(`x-access-token:${inputs.token}`).toString('base64')
  console.log(`::add-mask::${credentials}`)
  const gitEnv = {
    ...env,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${credentials}`,
  }
  return (args, options = {}) => run('git', ['-C', repo, ...args], { env: gitEnv, name: `git ${args[0]}`, ...options })
}

function pushPreviews(folder, files, pullRequest) {
  const repo = path.join(temp, 'diagram-previews-repo')
  const git = gitWithToken(repo)
  mkdirSync(repo, { recursive: true })
  run('git', ['init', '-q', repo])
  git(['remote', 'add', 'origin', `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}.git`], { allowFailure: true })
  const fetched = git(['fetch', '--no-tags', '--depth=1', 'origin', inputs.branch], { allowFailure: true })
  git(
    fetched.status === 0
      ? ['checkout', '-q', '-B', inputs.branch, 'FETCH_HEAD']
      : ['checkout', '-q', '--orphan', inputs.branch],
  )
  for (const file of files) {
    const target = path.join(repo, folder, file)
    mkdirSync(path.dirname(target), { recursive: true })
    copyFileSync(path.join(temp, 'diagram-previews', file), target)
  }
  git(['add', '--', folder])
  if (git(['diff', '--cached', '--quiet'], { allowFailure: true }).status === 0) return
  git([
    '-c',
    `user.name=${BOT_NAME}`,
    '-c',
    `user.email=${BOT_EMAIL}`,
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-q',
    '-m',
    `Diagram images for #${pullRequest}`,
  ])
  for (let attempt = 1; ; attempt++) {
    if (git(['push', '-q', 'origin', `HEAD:refs/heads/${inputs.branch}`], { allowFailure: true }).status === 0) return
    if (attempt === PUSH_ATTEMPTS) throw new ActionError(`The images could not be pushed to ${inputs.branch}.`)
    git(['fetch', '--no-tags', '--depth=1', 'origin', inputs.branch])
    git(['rebase', '-q', 'FETCH_HEAD'])
  }
}

function upsertComment(pullRequest, body) {
  const ghEnv = { ...env, GH_TOKEN: inputs.token }
  const api = `repos/${env.GITHUB_REPOSITORY}/issues`
  const comments = JSON.parse(
    run('gh', ['api', '--paginate', '--slurp', `${api}/${pullRequest}/comments`], { env: ghEnv }).stdout,
  ).flat()
  const existing = comments.find((comment) => comment.body?.startsWith(COMMENT_MARKER))
  const [method, endpoint] = existing
    ? ['PATCH', `${api}/comments/${existing.id}`]
    : ['POST', `${api}/${pullRequest}/comments`]
  run('gh', ['api', '--method', method, endpoint, '--input', '-'], { env: ghEnv, input: JSON.stringify({ body }) })
}

function compareImages(command) {
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'))
  const pullRequest = event.pull_request
  const base = pullRequest.base.sha
  const head = run('git', ['rev-parse', 'HEAD']).stdout.trim()
  ensureCommit(base)
  const changes = parseNameStatus(
    run('git', ['diff', '--name-status', '--no-renames', base, head, '--', ...pathspecs(inputs.patterns)]).stdout,
  )
  const previews = path.join(temp, 'diagram-previews')
  setOutput('previews', [previews])
  if (changes.length === 0) {
    console.log('The pull request changes no diagram.')
    return
  }
  const entries = changes.map(({ kind, file }, index) => {
    const folder = `${index + 1}`
    const entry = { file }
    if (kind !== 'added') {
      const before = path.join(temp, 'diagram-before', folder, path.basename(file))
      mkdirSync(path.dirname(before), { recursive: true })
      writeFileSync(before, run('git', ['show', `${base}:${file}`]).stdout)
      entry.before = `${folder}/before.${inputs.format}`
      render(command, before, path.join(previews, entry.before))
    }
    if (kind !== 'removed') {
      entry.after = `${folder}/after.${inputs.format}`
      render(command, file, path.join(previews, entry.after))
    }
    console.log(`Rendered ${file} (${kind}).`)
    return entry
  })
  summary(['### Changed diagrams', '', ...changes.map(({ kind, file }) => `- \`${file}\` (${kind})`)].join('\n'))
  if (!inputs.publish) return
  if (pullRequest.head.repo?.full_name !== env.GITHUB_REPOSITORY) {
    console.log('::notice::A pull request from a fork gets no image comment, because its token cannot write.')
    return
  }
  const folder = `pr-${pullRequest.number}/${head.slice(0, 7)}`
  const files = entries.flatMap((entry) => [entry.before, entry.after].filter(Boolean))
  pushPreviews(folder, files, pullRequest.number)
  const url = (file) =>
    file &&
    imageUrl({
      server: env.GITHUB_SERVER_URL,
      repository: env.GITHUB_REPOSITORY,
      branch: inputs.branch,
      file: `${folder}/${file}`,
    })
  upsertComment(
    pullRequest.number,
    commentBody({
      commit: head,
      entries: entries.map((entry) => ({ file: entry.file, before: url(entry.before), after: url(entry.after) })),
    }),
  )
  console.log(`Commented on #${pullRequest.number}.`)
}

try {
  if (!['png', 'svg'].includes(inputs.format)) throw new ActionError('The format input must be png or svg.')
  if (!['auto', 'write', 'compare'].includes(inputs.mode))
    throw new ActionError('The mode input must be auto, write or compare.')
  const compare = inputs.mode === 'compare' || (inputs.mode === 'auto' && env.GITHUB_EVENT_NAME === 'pull_request')
  const command = appCommand()
  if (compare) compareImages(command)
  else writeImages(command)
} catch (error) {
  if (!(error instanceof ActionError)) throw error
  console.log(`::error::${error.message}`)
  process.exitCode = 1
}
