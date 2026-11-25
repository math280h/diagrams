import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { ICON_SOURCES } from './icons/sources.ts'

/** The file of every icon name that a release can have written, by icon set. A name never leaves the file. */
export const RELEASED_IDS_FILE = 'src/canvas/icons/released-ids.json'

/** Icon names by icon set: `lucide`, or the prefix of a set icon such as `aws`. */
export type IconIds = Readonly<Record<string, readonly string[]>>

const ROOT = path.resolve(import.meta.dirname, '..')
const HOW = 'See "Keep icon names" in docs/RELEASING.md.'

/** Returns the icon set of an icon name: the prefix of a set icon, or `lucide` for a Lucide name. */
export function setOfId(id: string): string {
  const colon = id.indexOf(':')
  return colon === -1 ? 'lucide' : id.slice(0, colon)
}

/** Returns the list with the added names, with the sets and the names of each set in order. */
export function withIds(list: IconIds, added: Iterable<string>): Record<string, string[]> {
  const sets = new Map(Object.entries(list).map(([set, ids]) => [set, new Set(ids)]))
  for (const id of added) {
    const set = setOfId(id)
    sets.set(set, (sets.get(set) ?? new Set()).add(id))
  }
  return Object.fromEntries([...sets.keys()].toSorted().map((set) => [set, [...sets.get(set)!].toSorted()] as const))
}

/** Returns the names on the base list that the new list does not have. */
export function removedIds(base: IconIds, list: IconIds): string[] {
  const kept = new Set(Object.values(list).flat())
  return Object.values(base)
    .flat()
    .filter((id) => !kept.has(id))
}

function git(...args: string[]): string {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function readList(): IconIds {
  return JSON.parse(readFileSync(path.join(ROOT, RELEASED_IDS_FILE), 'utf8')) as IconIds
}

function baseList(ref: string): IconIds {
  git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`)
  try {
    git('cat-file', '-e', `${ref}:${RELEASED_IDS_FILE}`)
  } catch {
    return {}
  }
  return JSON.parse(git('show', `${ref}:${RELEASED_IDS_FILE}`)) as IconIds
}

async function offeredIds(): Promise<string[]> {
  const { iconNames } = await import('lucide-react/dynamic')
  const setIds = ICON_SOURCES.flatMap((source) => {
    const file = path.join(ROOT, 'src', 'canvas', 'icons', 'data', `${source.file}.json`)
    const set = JSON.parse(readFileSync(file, 'utf8')) as { entries: { id: string }[] }
    return set.entries.map((entry) => entry.id)
  })
  return [...iconNames, ...setIds]
}

async function main() {
  const { values } = parseArgs({ options: { base: { type: 'string' } } })
  const list = readList()
  if (values.base !== undefined) {
    const removed = removedIds(baseList(values.base), list)
    for (const id of removed) {
      console.error(`::error::The change removes ${id} from ${RELEASED_IDS_FILE}. Names only come in. ${HOW}`)
    }
    if (removed.length > 0) process.exit(1)
    console.log(`${RELEASED_IDS_FILE} keeps every icon name of ${values.base}.`)
    return
  }
  const next = withIds(list, await offeredIds())
  const before = new Set(Object.values(list).flat())
  const added = Object.values(next)
    .flat()
    .filter((id) => !before.has(id))
  writeFileSync(path.join(ROOT, RELEASED_IDS_FILE), `${JSON.stringify(next, null, 2)}\n`)
  console.log(
    added.length > 0
      ? `Added ${added.length} icon names to ${RELEASED_IDS_FILE}: ${added.join(', ')}.`
      : `${RELEASED_IDS_FILE} already holds every icon name of the app.`,
  )
}

if (import.meta.main) await main()
