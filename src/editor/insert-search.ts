import { entryScore, type IconEntry } from '@/canvas/icons/library'
import type { Preset } from '@/model/presets'

export type InsertResult =
  | { kind: 'preset'; preset: Preset; score: number }
  | { kind: 'icon'; entry: IconEntry; score: number }

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** Scores a preset on the scale of {@link entryScore}: the label counts as the title, the keywords as keywords. */
export function presetScore(preset: Preset, query: string): number {
  const text = query.trim().toLowerCase()
  const tokens = words(text)
  if (tokens.length === 0) return 0
  const label = preset.label.toLowerCase()
  if (label === text) return 4
  if (label.startsWith(text)) return 3
  const labelWords = words(preset.label)
  if (tokens.every((token) => labelWords.some((word) => word.startsWith(token)))) return 2
  const keywords = preset.keywords.flatMap(words)
  return tokens.every((token) => keywords.some((keyword) => keyword.startsWith(token))) ? 1 : 0
}

/**
 * Returns the presets and the icon entries that match a search in one list, best matches first. With equal scores,
 * presets come before icons and shorter names before longer ones.
 */
export function insertResults(
  query: string,
  presets: readonly Preset[],
  entries: readonly IconEntry[],
): InsertResult[] {
  const text = query.trim().toLowerCase()
  const results: InsertResult[] = [
    ...presets.map((preset): InsertResult => ({ kind: 'preset', preset, score: presetScore(preset, text) })),
    ...entries.map((entry): InsertResult => ({ kind: 'icon', entry, score: entryScore(entry, text) })),
  ]
  const name = (result: InsertResult) => (result.kind === 'preset' ? result.preset.label : result.entry.title)
  return results
    .filter((result) => result.score > 0)
    .toSorted(
      (a, b) =>
        b.score - a.score || Number(a.kind === 'icon') - Number(b.kind === 'icon') || name(a).length - name(b).length,
    )
}
