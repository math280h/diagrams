import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

/** The file of every theme key that a release can have read, by group. A key never leaves the file. */
export const RELEASED_KEYS_FILE = 'src/themes/released-keys.json'
const TOKENS_FILE = 'src/themes/tokens.ts'
const GROUPS = ['app', 'canvas', 'window'] as const
const RELEASE_TAGS = 'v*'

/** Theme keys by group: `app`, `canvas` or `window`. */
export type ThemeKeys = Readonly<Record<string, readonly string[]>>

/** The exports of a version of `src/themes/tokens.ts` that name theme keys. Old versions have no `THEME_KEY_ALIASES`. */
export interface TokenNames {
  APP_COLORS: readonly string[]
  CANVAS_COLORS: readonly string[]
  CANVAS_PERCENTS: readonly string[]
  CANVAS_OPACITIES: readonly string[]
  WINDOW_COLORS: readonly string[]
  THEME_KEY_ALIASES?: Readonly<Record<string, Readonly<Record<string, string>>>>
}

const ROOT = path.resolve(import.meta.dirname, '..')
const HOW = 'See "Keep theme keys" in docs/RELEASING.md.'

/** Returns the keys that a version of the tokens module reads: its keys and their earlier names. */
export function keysOf(tokens: TokenNames): Record<string, string[]> {
  const aliases = (group: string) => Object.keys(tokens.THEME_KEY_ALIASES?.[group] ?? {})
  return {
    app: [...tokens.APP_COLORS, ...aliases('app')],
    canvas: [...tokens.CANVAS_COLORS, ...tokens.CANVAS_PERCENTS, ...tokens.CANVAS_OPACITIES, ...aliases('canvas')],
    window: [...tokens.WINDOW_COLORS, ...aliases('window')],
  }
}

/** Returns the list with the added keys, with the groups in order and the keys of each group sorted. */
export function withKeys(list: ThemeKeys, added: ThemeKeys): Record<string, string[]> {
  const groups = new Set([...GROUPS, ...Object.keys(list), ...Object.keys(added)])
  return Object.fromEntries(
    [...groups].map((group) => [group, [...new Set([...(list[group] ?? []), ...(added[group] ?? [])])].toSorted()]),
  )
}

/** Returns the keys of the base list that the new list does not have, as `group.key`. */
export function removedKeys(base: ThemeKeys, list: ThemeKeys): string[] {
  return Object.entries(base).flatMap(([group, keys]) => {
    const kept = new Set(list[group] ?? [])
    return keys.filter((key) => !kept.has(key)).map((key) => `${group}.${key}`)
  })
}

function git(...args: string[]): string {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function hasFile(ref: string, file: string): boolean {
  try {
    git('cat-file', '-e', `${ref}:${file}`)
    return true
  } catch {
    return false
  }
}

function readList(): ThemeKeys {
  return JSON.parse(readFileSync(path.join(ROOT, RELEASED_KEYS_FILE), 'utf8')) as ThemeKeys
}

function baseList(ref: string): ThemeKeys {
  git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`)
  return hasFile(ref, RELEASED_KEYS_FILE) ? (JSON.parse(git('show', `${ref}:${RELEASED_KEYS_FILE}`)) as ThemeKeys) : {}
}

async function importTokens(file: string): Promise<TokenNames> {
  return (await import(pathToFileURL(file).href)) as TokenNames
}

async function releaseKeys(): Promise<ThemeKeys[]> {
  const tags = git('tag', '--list', RELEASE_TAGS).split('\n').filter(Boolean)
  const folder = mkdtempSync(path.join(tmpdir(), 'theme-keys-'))
  try {
    const found: ThemeKeys[] = []
    for (const tag of tags) {
      if (!hasFile(tag, TOKENS_FILE)) continue
      const file = path.join(folder, `${tag}.ts`)
      writeFileSync(file, git('show', `${tag}:${TOKENS_FILE}`))
      found.push(keysOf(await importTokens(file)))
    }
    return found
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}

async function main() {
  const { values } = parseArgs({ options: { base: { type: 'string' } } })
  const list = readList()
  if (values.base !== undefined) {
    const removed = removedKeys(baseList(values.base), list)
    for (const key of removed) {
      console.error(`::error::The change removes ${key} from ${RELEASED_KEYS_FILE}. Keys only come in. ${HOW}`)
    }
    if (removed.length > 0) process.exit(1)
    console.log(`${RELEASED_KEYS_FILE} keeps every theme key of ${values.base}.`)
    return
  }
  const sources = [keysOf(await importTokens(path.join(ROOT, TOKENS_FILE))), ...(await releaseKeys())]
  const next = sources.reduce<ThemeKeys>((keys, source) => withKeys(keys, source), list)
  const added = removedKeys(next, list)
  writeFileSync(path.join(ROOT, RELEASED_KEYS_FILE), `${JSON.stringify(next, null, 2)}\n`)
  console.log(
    added.length > 0
      ? `Added ${added.length} theme keys to ${RELEASED_KEYS_FILE}: ${added.join(', ')}.`
      : `${RELEASED_KEYS_FILE} already holds every theme key of the app and of the release tags.`,
  )
}

if (import.meta.main) await main()
