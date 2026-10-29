import type { IconArt, IconEntry, IconSourceId } from './library'

/** The data of an icon set file: its entries and the SVG images that they point to. */
export interface IconSetData {
  entries: IconEntry[]
  art?: Record<string, IconArt>
}

/** Returns the entries and images of the named icons, by icon source. Sources without a named icon are left out. */
export function iconSubset(
  names: ReadonlySet<string>,
  sets: Readonly<Partial<Record<IconSourceId, IconSetData>>>,
): Partial<Record<IconSourceId, IconSetData>> {
  const subset: Partial<Record<IconSourceId, IconSetData>> = {}
  for (const [source, set] of Object.entries(sets) as [IconSourceId, IconSetData][]) {
    const entries = set.entries.filter((entry) => names.has(entry.id))
    if (entries.length === 0) continue
    const art = Object.fromEntries(
      entries.flatMap((entry) => (entry.art && set.art?.[entry.art] ? [[entry.art, set.art[entry.art]!]] : [])),
    )
    subset[source] = Object.keys(art).length > 0 ? { entries, art } : { entries }
  }
  return subset
}
