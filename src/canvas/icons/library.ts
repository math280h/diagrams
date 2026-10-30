import type { CardForm } from '@/model/schema'
import awsUrl from './data/aws.json?url'
import azureUrl from './data/azure.json?url'
import gcpUrl from './data/gcp.json?url'
import k8sUrl from './data/k8s.json?url'
import logosUrl from './data/logos.json?url'
import salesforceUrl from './data/salesforce.json?url'
import templatesUrl from './data/templates.json?url'
import type { IconSetData } from './subset'

export const ICON_SOURCES = [
  { id: 'aws', label: 'AWS' },
  { id: 'azure', label: 'Azure' },
  { id: 'gcp', label: 'Google Cloud' },
  { id: 'k8s', label: 'Kubernetes' },
  { id: 'logo', label: 'Logos' },
  { id: 'salesforce', label: 'Salesforce' },
] as const

export type IconSourceId = (typeof ICON_SOURCES)[number]['id']

/** The file of each icon set in `src/canvas/icons/data`. */
export const ICON_SET_FILES: Record<IconSourceId, string> = {
  aws: 'aws.json',
  azure: 'azure.json',
  gcp: 'gcp.json',
  k8s: 'k8s.json',
  logo: 'logos.json',
  salesforce: 'salesforce.json',
}

const SET_URLS: Record<IconSourceId, string> = {
  aws: awsUrl,
  azure: azureUrl,
  gcp: gcpUrl,
  k8s: k8sUrl,
  logo: logosUrl,
  salesforce: salesforceUrl,
}

/** An SVG image from a cloud provider set, with an optional variant for dark backgrounds. */
export interface IconArt {
  light: string
  dark?: string
  /** The colour of the rounded square behind a white glyph, for example `#5867e8`. */
  tile?: string
  /** The part of the tile that the glyph fills, from 0 to 1. Without it, the glyph fills the tile. */
  glyph?: number
}

export interface IconEntry {
  /** The icon name in the diagram data, for example `aws:lambda`. */
  id: string
  title: string
  category: string
  form: CardForm
  /** The names in lower case that {@link matchIcon} accepts for this entry. */
  aliases: string[]
  keywords: string[]
  /** The key of the image in {@link IconSet.art}. A logo has a path instead. */
  art?: string
  /** The SVG path data of a single-colour logo, in a 24 by 24 view box. */
  path?: string
}

export interface IconSet {
  source: IconSourceId
  entries: IconEntry[]
  art: Record<string, IconArt>
  byId: Map<string, IconEntry>
}

const sets = new Map<IconSourceId, IconSet>()
const pending = new Map<IconSourceId, Promise<IconSet>>()
const templateEntries = new Map<string, IconEntry>()
let templateSets: Promise<Map<IconSourceId, IconSet>> | null = null

const SOURCE_IDS: ReadonlySet<string> = new Set(ICON_SOURCES.map((source) => source.id))

/** Returns the source of an icon name, or `null` for a Lucide icon name. */
export function iconSourceOf(name: string): IconSourceId | null {
  const prefix = name.slice(0, name.indexOf(':'))
  return SOURCE_IDS.has(prefix) ? (prefix as IconSourceId) : null
}

export function loadIconSet(source: IconSourceId): Promise<IconSet> {
  let job = pending.get(source)
  if (!job) {
    job = fetch(SET_URLS[source])
      .then((response) => response.json() as Promise<{ entries: IconEntry[]; art?: Record<string, IconArt> }>)
      .then(({ entries, art = {} }) => {
        const set = toIconSet(source, { entries, art })
        sets.set(source, set)
        return set
      })
    job.catch(() => pending.delete(source))
    pending.set(source, job)
  }
  return job
}

function toIconSet(source: IconSourceId, { entries, art = {} }: IconSetData): IconSet {
  return { source, entries, art, byId: new Map(entries.map((entry) => [entry.id, entry])) }
}

function loadTemplateSets(): Promise<Map<IconSourceId, IconSet>> {
  if (!templateSets) {
    const job = fetch(templatesUrl)
      .then((response) => response.json() as Promise<Partial<Record<IconSourceId, IconSetData>>>)
      .then((data) => {
        const result = new Map<IconSourceId, IconSet>()
        for (const [source, set] of Object.entries(data) as [IconSourceId, IconSetData][]) {
          result.set(source, toIconSet(source, set))
          for (const entry of set.entries) templateEntries.set(entry.id, entry)
        }
        return result
      })
    job.catch(() => {
      templateSets = null
    })
    templateSets = job
  }
  return templateSets
}

/**
 * Returns a set that holds the icon: the full set if the app has it, or else the small set of the icons that the
 * templates use. Only an icon outside the templates loads its full set.
 *
 * @returns `null` for a Lucide icon name.
 */
export async function loadSetOfIcon(name: string): Promise<IconSet | null> {
  const source = iconSourceOf(name)
  if (!source) return null
  const full = sets.get(source)
  if (full) return full
  const template = (await loadTemplateSets().catch(() => null))?.get(source)
  return template?.byId.has(name) ? template : loadIconSet(source)
}

/** Adds an icon set that the app has without a fetch, such as the icons that an exported page carries. */
export function registerIconSet(set: IconSet) {
  sets.set(set.source, set)
  pending.set(set.source, Promise.resolve(set))
}

export function loadIconSets(): Promise<IconSet[]> {
  return Promise.all(ICON_SOURCES.map((source) => loadIconSet(source.id)))
}

/** Returns the entry of an icon name if the app has loaded its set. */
export function iconEntry(name: string): IconEntry | undefined {
  const source = iconSourceOf(name)
  return source ? (sets.get(source)?.byId.get(name) ?? templateEntries.get(name)) : undefined
}

const artUrls = new Map<string, string>()

/** Returns a data URL for an SVG image. */
export function artUrl(svg: string): string {
  let url = artUrls.get(svg)
  if (!url) {
    url = `data:image/svg+xml,${encodeURIComponent(svg)}`
    artUrls.set(svg, url)
  }
  return url
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/**
 * Scores how well an entry matches a search: 4 for the whole title or an alias, 3 for a title that starts with the
 * text, 2 when every word starts a title word, 1 when every word starts a keyword, and 0 for no match.
 */
export function entryScore(entry: IconEntry, query: string, tokens: string[] = words(query)): number {
  const title = entry.title.toLowerCase()
  if (entry.aliases.includes(query) || title === query) return 4
  const titleWords = words(entry.title)
  if (!tokens.every((token) => entry.keywords.some((keyword) => keyword.startsWith(token)))) return 0
  if (title.startsWith(query)) return 3
  if (tokens.every((token) => titleWords.some((word) => word.startsWith(token)))) return 2
  return 1
}

/**
 * Returns the entries that match a search text, best matches first.
 *
 * Every word of the text must start a title word or a keyword of the entry.
 */
export function searchIcons(searched: readonly IconSet[], text: string, limit = 60): IconEntry[] {
  const query = text.trim().toLowerCase()
  const tokens = words(query)
  if (tokens.length === 0) return []
  const scored: { entry: IconEntry; score: number }[] = []
  for (const set of searched) {
    for (const entry of set.entries) {
      const score = entryScore(entry, query, tokens)
      if (score > 0) scored.push({ entry, score })
    }
  }
  return scored
    .toSorted((a, b) => b.score - a.score || a.entry.title.length - b.entry.title.length)
    .slice(0, limit)
    .map(({ entry }) => entry)
}

const ROLE_WORDS = new Set([
  'api',
  'app',
  'broker',
  'bucket',
  'cache',
  'cluster',
  'database',
  'db',
  'function',
  'gateway',
  'instance',
  'proxy',
  'queue',
  'server',
  'service',
  'store',
  'stream',
  'table',
  'topic',
  'worker',
])

/**
 * Returns the entry that a node label names, if any.
 *
 * The label must be an alias of the entry, or an alias and one role word such as "cache" or "db".
 * Longer aliases win.
 *
 * @example
 * ```ts
 * matchIcon(sets, 'Redis cache') // the Redis logo
 * matchIcon(sets, 'Go to checkout') // undefined
 * ```
 */
export function matchIcon(searched: readonly IconSet[], label: string): IconEntry | undefined {
  const normalized = words(label.replace(/\//g, '')).join(' ')
  const trimmed = normalized.split(' ')
  const withoutRole = ROLE_WORDS.has(trimmed.at(-1) ?? '') ? trimmed.slice(0, -1).join(' ') : normalized
  let best: IconEntry | undefined
  let bestLength = 0
  for (const set of searched) {
    for (const entry of set.entries) {
      for (const alias of entry.aliases) {
        const key = words(alias.replace(/\//g, '')).join(' ')
        if (key.length > bestLength && (key === normalized || key === withoutRole)) {
          best = entry
          bestLength = key.length
        }
      }
    }
  }
  return best
}
