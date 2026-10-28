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
import { samePixels } from './png.mjs'

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
  baseApp: env.INPUT_BASE_APP ?? '',
  baseRoot: env.INPUT_BASE_ROOT ?? '',
  screens: env.INPUT_SCREENS ?? '',
  baseScreens: env.INPUT_BASE_SCREENS ?? '',
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
  return withDisplay(inputs.app ? splitCommand(inputs.app) : installApp())
}

function withDisplay(command) {
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

function diagramFiles({ untracked = false, cwd } = {}) {
  const which = untracked ? ['--cached', '--others', '--exclude-standard'] : []
  const out = run('git', ['ls-files', '-z', ...which, '--', ...pathspecs(inputs.patterns)], { cwd }).stdout
  return [...new Set(out.split('\0').filter(Boolean))]
}

function writeImages(command) {
  const files = diagramFiles()
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

function shortSha(sha) {
  return sha.slice(0, 7)
}

function imageLink(folder, file) {
  return (
    file &&
    imageUrl({
      server: env.GITHUB_SERVER_URL,
      repository: env.GITHUB_REPOSITORY,
      branch: inputs.branch,
      file: `${folder}/${file}`,
    })
  )
}

function publishComment(pullRequest, commit, entries, intro) {
  if (!inputs.publish) return
  if (!pullRequest) {
    console.log('::notice::The event is not a pull request, so the action does not comment.')
    return
  }
  if (pullRequest.head.repo?.full_name !== env.GITHUB_REPOSITORY) {
    console.log('::notice::A pull request from a fork gets no image comment, because its token cannot write.')
    return
  }
  const folder = `pr-${pullRequest.number}/${shortSha(commit)}`
  const files = entries.flatMap((entry) => [entry.before, entry.after].filter(Boolean))
  if (files.length > 0) pushPreviews(folder, files, pullRequest.number)
  const linked = entries.map((entry) => ({
    ...entry,
    before: imageLink(folder, entry.before),
    after: imageLink(folder, entry.after),
  }))
  upsertComment(pullRequest.number, commentBody({ entries: linked, intro }))
  console.log(`Commented on #${pullRequest.number}.`)
}

function compareScreens(previews, firstIndex) {
  if (!inputs.screens) return { entries: [], count: 0 }
  if (!existsSync(inputs.screens)) throw new ActionError(`The screens folder ${inputs.screens} does not exist.`)
  if (!inputs.baseScreens || !existsSync(inputs.baseScreens)) {
    console.log('::notice::The base commit has no app screens, so the action compares none.')
    return { entries: [], count: 0 }
  }
  const pngs = (folder) =>
    readdirSync(folder)
      .filter((name) => name.endsWith('.png'))
      .toSorted()
  const names = pngs(inputs.screens)
  const baseNames = new Set(pngs(inputs.baseScreens))
  const entries = []
  names.forEach((name, index) => {
    const after = `${firstIndex + index}/after.png`
    const before = `${firstIndex + index}/before.png`
    mkdirSync(path.join(previews, `${firstIndex + index}`), { recursive: true })
    copyFileSync(path.join(inputs.screens, name), path.join(previews, after))
    const file = `app/${name}`
    if (!baseNames.has(name)) {
      entries.push({ file, after })
      return
    }
    copyFileSync(path.join(inputs.baseScreens, name), path.join(previews, before))
    const same = samePixels(readFileSync(path.join(previews, before)), readFileSync(path.join(previews, after)))
    console.log(`${same ? 'Same screen' : 'Different screen'}: ${name}`)
    if (!same) entries.push({ file, before, after })
  })
  return { entries, count: names.length }
}

function compareApps(command, baseCommand) {
  const event = env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')) : {}
  const commit = event.pull_request?.head?.sha ?? run('git', ['rev-parse', 'HEAD']).stdout.trim()
  const files = diagramFiles({ untracked: true })
  const baseFiles = inputs.baseRoot ? diagramFiles({ untracked: true, cwd: inputs.baseRoot }) : files
  const baseFile = (file) => (inputs.baseRoot ? path.join(inputs.baseRoot, file) : file)
  const removed = baseFiles.filter((file) => !files.includes(file))
  const previews = path.join(temp, 'diagram-previews')
  setOutput('previews', [previews])
  const entries = []
  files.forEach((file, index) => {
    const after = `${index + 1}/after.${inputs.format}`
    const before = `${index + 1}/before.${inputs.format}`
    render(command, file, path.join(previews, after))
    if (!baseFiles.includes(file)) {
      console.log(`New diagram: ${file}`)
      entries.push({ file, after })
      return
    }
    try {
      render(baseCommand, baseFile(file), path.join(previews, before))
    } catch (error) {
      if (!(error instanceof ActionError)) throw error
      console.log(`::warning::The base app could not render ${file}. ${error.message}`)
      entries.push({ file, after, beforeNote: 'The base app cannot open it' })
      return
    }
    const same = readFileSync(path.join(previews, before)).equals(readFileSync(path.join(previews, after)))
    console.log(`${same ? 'Same image' : 'Different image'}: ${file}`)
    if (!same) entries.push({ file, before, after })
  })
  removed.forEach((file, index) => {
    const before = `${files.length + index + 1}/before.${inputs.format}`
    try {
      render(baseCommand, baseFile(file), path.join(previews, before))
      console.log(`Removed diagram: ${file}`)
      entries.push({ file, before })
    } catch (error) {
      if (!(error instanceof ActionError)) throw error
      console.log(`::warning::The base app could not render the removed diagram ${file}. ${error.message}`)
    }
  })
  const total = files.length + removed.length
  const screens = compareScreens(previews, total + 1)
  entries.push(...screens.entries)
  summary(
    [
      '### Diagram images',
      '',
      `${entries.length} of ${total + screens.count} diagrams and app screens look different with this commit.`,
      ...entries.map((entry) => `- \`${entry.file}\``),
    ].join('\n'),
  )
  const counted = screens.count > 0 ? `${total} diagrams and ${screens.count} app screens` : `${total} diagrams`
  const compared = `It compares ${counted} with the ${inputs.baseRoot ? 'base commit' : 'app of the base commit'}.`
  const intro =
    entries.length > 0
      ? `The diagrams that look different with this pull request, as of ${shortSha(commit)}. ${compared}`
      : `No diagram looks different with this pull request, as of ${shortSha(commit)}. ${compared}`
  publishComment(event.pull_request, commit, entries, intro)
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
  const commit = pullRequest.head?.sha ?? head
  publishComment(
    pullRequest,
    commit,
    entries,
    `The diagrams that this pull request changes, as of ${shortSha(commit)}.`,
  )
}

try {
  if (!['png', 'svg'].includes(inputs.format)) throw new ActionError('The format input must be png or svg.')
  if (!['auto', 'write', 'compare'].includes(inputs.mode))
    throw new ActionError('The mode input must be auto, write or compare.')
  const compare = inputs.mode === 'compare' || (inputs.mode === 'auto' && env.GITHUB_EVENT_NAME === 'pull_request')
  const command = appCommand()
  const baseCommand = inputs.baseApp ? withDisplay(splitCommand(inputs.baseApp)) : null
  if (compare && baseCommand) compareApps(command, baseCommand)
  else if (compare) compareImages(command)
  else writeImages(command)
} catch (error) {
  if (!(error instanceof ActionError)) throw error
  console.log(`::error::${error.message}`)
  process.exitCode = 1
}
