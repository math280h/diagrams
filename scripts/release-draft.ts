import { execFileSync } from 'node:child_process'

/** A merged pull request as the draft needs it. */
export interface MergedPullRequest {
  number: number
  title: string
  labels: string[]
  files: string[]
}

export type ChangeKind = 'New' | 'Improvements' | 'Fixes'

const KINDS: ChangeKind[] = ['New', 'Improvements', 'Fixes']
const NEW_VERBS = new Set(['add', 'allow', 'copy', 'explore', 'export', 'import', 'introduce', 'let', 'support'])
const FIX_VERBS = new Set(['fix', 'prevent', 'repair', 'restore', 'stop'])

const AREAS: [RegExp, string][] = [
  [/^(src\/agent|electron\/agent|claude-plugin)\//, 'MCP server and skills'],
  [/^(src\/player|src\/engine|src\/editor\/flow)\//, 'Flows and Present'],
  [/^src\/export\//, 'Export'],
  [/^(src\/library|src\/templates)\//, 'Library and templates'],
  [/^(electron|src\/desktop)\//, 'Desktop app'],
  [/^(src\/canvas|src\/styles)\//, 'Canvas'],
  [/^src\/(editor|components|store)\//, 'Editor'],
  [/^src\/(model|persistence|io|import)\//, 'Diagrams and files'],
  [/^src\//, 'App'],
]
const NO_AREA = 'Build and docs'

/**
 * Returns the kind of a change: a `bug` label makes it a fix and an `enhancement` label makes it new. Without them, the
 * first word of the title decides, and anything else is an improvement.
 */
export function changeKind(pullRequest: Pick<MergedPullRequest, 'title' | 'labels'>): ChangeKind {
  if (pullRequest.labels.includes('bug')) return 'Fixes'
  if (pullRequest.labels.includes('enhancement')) return 'New'
  const [verb = ''] = pullRequest.title.trim().toLowerCase().split(/\s+/, 1)
  if (FIX_VERBS.has(verb)) return 'Fixes'
  if (NEW_VERBS.has(verb)) return 'New'
  return 'Improvements'
}

/** Returns the area with the most changed files of a pull request, leaving tests, docs and format samples out. */
export function changeArea(files: readonly string[]): string {
  const counts = new Map<string, number>()
  for (const file of files) {
    if (/\.test\.ts$|^e2e\/|^docs\/|\/formats\//.test(file)) continue
    const area = AREAS.find(([pattern]) => pattern.test(file))?.[1]
    if (area) counts.set(area, (counts.get(area) ?? 0) + 1)
  }
  let best = NO_AREA
  for (const [area, count] of counts) if (count > (counts.get(best) ?? 0)) best = area
  return best
}

/** Returns the tool names of `src/agent/tool-definitions.ts`. */
export function toolNames(source: string): string[] {
  const start = source.indexOf('export const TOOL_DEFINITIONS')
  if (start < 0) return []
  return [...source.slice(start).matchAll(/^ {2}([a-z_]+): \{$/gm)].map((match) => match[1]!)
}

/** Returns the shortcut labels of the shortcut sheet in `src/lib/shortcut-keys.ts`. */
export function shortcutLabels(source: string): string[] {
  const start = source.indexOf('export const SHORTCUT_GROUPS')
  if (start < 0) return []
  return [...source.slice(start).matchAll(/label: '([^']+)'/g)].map((match) => match[1]!)
}

function added(before: readonly string[], after: readonly string[]) {
  return after.filter((item) => !before.includes(item))
}

export interface DraftInput {
  repository: string
  previousTag: string | null
  tag: string
  pullRequests: MergedPullRequest[]
  tools: { before: string[]; after: string[] }
  shortcuts: { before: string[]; after: string[] }
}

/**
 * Writes the notes of a draft release in Markdown: New, Improvements and Fixes grouped by area, then the MCP server
 * and Keyboard shortcuts sections when those changed. A comment that GitHub does not show lists the new items that want
 * a still and a short clip before the release goes out.
 */
export function draftNotes({ repository, previousTag, tag, pullRequests, tools, shortcuts }: DraftInput): string {
  const lines: string[] = []
  const fresh = pullRequests.filter((pullRequest) => changeKind(pullRequest) === 'New')
  if (fresh.length > 0) {
    lines.push(
      '<!-- Before you publish, add a still and a short clip (Export, then Animation) of each new item:',
      ...fresh.map((pullRequest) => `     - ${pullRequest.title}`),
      '-->',
      '',
    )
  }
  for (const kind of KINDS) {
    const ofKind = pullRequests.filter((pullRequest) => changeKind(pullRequest) === kind)
    if (ofKind.length === 0) continue
    lines.push(`## ${kind}`, '')
    const byArea = Map.groupBy(ofKind, (pullRequest) => changeArea(pullRequest.files))
    for (const area of [...byArea.keys()].toSorted((a, b) => a.localeCompare(b))) {
      lines.push(`### ${area}`, '')
      for (const pullRequest of byArea.get(area)!) lines.push(`- ${pullRequest.title} (#${pullRequest.number})`)
      lines.push('')
    }
  }
  const newTools = added(tools.before, tools.after)
  const goneTools = added(tools.after, tools.before)
  if (newTools.length > 0 || goneTools.length > 0) {
    lines.push('## MCP server', '')
    if (newTools.length > 0) lines.push(`- New tools: ${newTools.map((name) => `\`${name}\``).join(', ')}.`)
    if (goneTools.length > 0) lines.push(`- Removed tools: ${goneTools.map((name) => `\`${name}\``).join(', ')}.`)
    lines.push('')
  }
  const newShortcuts = added(shortcuts.before, shortcuts.after)
  if (newShortcuts.length > 0) {
    lines.push('## Keyboard shortcuts', '', ...newShortcuts.map((label) => `- ${label}`), '')
  }
  if (previousTag) {
    lines.push(`**Full changelog**: https://github.com/${repository}/compare/${previousTag}...${tag}`)
  }
  return `${lines.join('\n').trim()}\n`
}

function run(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: 'utf8' }).trim()
}

function fileAt(ref: string, path: string): string {
  try {
    return execFileSync('git', ['show', `${ref}:${path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return ''
  }
}

/**
 * Returns the tag before `tag`: the newest earlier release, or for a preview the newest earlier tag of any kind. The
 * moving `preview` tag never counts.
 */
export function previousTagOf(tag: string, tags: readonly string[]): string | null {
  const preview = /-(alpha|beta)\.\d+$/.test(tag)
  const candidates = tags.filter((candidate) => /^v\d+\.\d+\.\d+/.test(candidate) && candidate !== tag)
  const ordered = [...candidates, tag].toSorted((a, b) => a.localeCompare(b, 'en', { numeric: true }))
  const before = ordered.slice(0, ordered.indexOf(tag)).filter((candidate) => preview || !candidate.includes('-'))
  return before.at(-1) ?? null
}

function main() {
  const [tag] = process.argv.slice(2)
  const repository = process.env.GITHUB_REPOSITORY
  if (!tag || !repository)
    throw new Error('Run it as: GITHUB_REPOSITORY=owner/name node scripts/release-draft.ts <tag>')
  const previousTag = previousTagOf(tag, run('git', ['tag', '--list', 'v*']).split('\n').filter(Boolean))
  const range = previousTag ? `${previousTag}..${tag}` : tag
  const numbers = run('git', ['log', '--format=%s', range])
    .split('\n')
    .flatMap((title) => {
      const match = /\(#(\d+)\)$/.exec(title)
      return match ? [Number(match[1])] : []
    })
  const pullRequests = numbers.map((number): MergedPullRequest => {
    const data = JSON.parse(
      run('gh', ['pr', 'view', String(number), '--repo', repository, '--json', 'title,labels,files']),
    ) as { title: string; labels: { name: string }[]; files: { path: string }[] }
    return {
      number,
      title: data.title,
      labels: data.labels.map((label) => label.name),
      files: data.files.map((file) => file.path),
    }
  })
  const base = previousTag ?? `${tag}^`
  process.stdout.write(
    draftNotes({
      repository,
      previousTag,
      tag,
      pullRequests: pullRequests.toReversed(),
      tools: {
        before: toolNames(fileAt(base, 'src/agent/tool-definitions.ts')),
        after: toolNames(fileAt(tag, 'src/agent/tool-definitions.ts')),
      },
      shortcuts: {
        before: shortcutLabels(fileAt(base, 'src/lib/shortcut-keys.ts')),
        after: shortcutLabels(fileAt(tag, 'src/lib/shortcut-keys.ts')),
      },
    }),
  )
}

if (import.meta.main) main()
