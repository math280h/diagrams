import { dynamicIconImports } from 'lucide-react/dynamic'
import { describe, expect, it } from 'vitest'
import { currentIconName, ICON_ALIASES } from './aliases'
import { ICON_SET_FILES, ICON_SOURCES, iconSourceOf, type IconEntry } from './library'
import released from './released-ids.json'
import type { IconSetData } from './subset'

const FILES = import.meta.glob<IconSetData>('./data/*.json', { eager: true, import: 'default' })
const ENTRIES = new Map<string, { entry: IconEntry; set: IconSetData }>(
  Object.values(ICON_SET_FILES).flatMap((file) => {
    const set = FILES[`./data/${file}`]!
    return set.entries.map((entry) => [entry.id, { entry, set }] as const)
  }),
)
const LUCIDE: ReadonlySet<string> = new Set(Object.keys(dynamicIconImports))
const RELEASED: Readonly<Record<string, readonly string[]>> = released
const LISTED: ReadonlySet<string> = new Set(Object.values(RELEASED).flat())
const HOW = 'See "Keep icon names" in docs/RELEASING.md.'

function drawsWithoutAlias(name: string): boolean {
  if (!iconSourceOf(name)) return LUCIDE.has(name)
  const found = ENTRIES.get(name)
  if (!found) return false
  const { entry, set } = found
  return !!(entry.path ?? (entry.art && set.art?.[entry.art]?.light))
}

describe('icon names of earlier releases', () => {
  it('all still draw an icon', () => {
    const lost = [...LISTED].filter((name) => !drawsWithoutAlias(currentIconName(name)))
    expect(lost, `These names of earlier releases draw no icon now. ${HOW}`).toEqual([])
  })

  it('hold every icon name that the app has', () => {
    const missing = [...LUCIDE, ...ENTRIES.keys()].filter((name) => !LISTED.has(name))
    expect(missing, `Run node scripts/icon-ids.ts to add the new icon names. ${HOW}`).toEqual([])
  })

  it('are under their icon set', () => {
    const sets = new Set<string>(['lucide', ...ICON_SOURCES.map((source) => source.id)])
    expect(Object.keys(RELEASED).filter((set) => !sets.has(set))).toEqual([])
    for (const [set, names] of Object.entries(RELEASED)) {
      expect(names.filter((name) => (iconSourceOf(name) ?? 'lucide') !== set)).toEqual([])
    }
  })

  it('have an alias only when the name alone draws no icon, and the alias draws one', () => {
    for (const [name, alias] of Object.entries(ICON_ALIASES)) {
      expect(LISTED.has(name), `${name} is not a name of an earlier release`).toBe(true)
      expect(drawsWithoutAlias(name), `${name} draws an icon without the alias`).toBe(false)
      expect(drawsWithoutAlias(alias), `the alias ${alias} of ${name} draws no icon`).toBe(true)
    }
  })
})
