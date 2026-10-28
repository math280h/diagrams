import { describe, expect, it } from 'vitest'
import { BOUNDARY_KINDS } from '@/model/boundaries'
import { TEMPLATES, templateDiagrams } from '@/templates'
import { iconSourceOf, loadIconSets } from './library'

describe('icon sets', () => {
  it('load with an image or a path for every entry', async () => {
    const sets = await loadIconSets()
    expect(sets.map((set) => set.source)).toEqual(['aws', 'azure', 'gcp', 'k8s', 'logo'])
    for (const set of sets) {
      expect(set.entries.length).toBeGreaterThan(20)
      for (const entry of set.entries) {
        expect(entry.id.startsWith(`${set.source}:`)).toBe(true)
        expect(entry.path ?? (entry.art && set.art[entry.art]?.light)).toBeTruthy()
      }
    }
  })

  it('contain every set icon that the boundary kinds and the templates use', async () => {
    const sets = await loadIconSets()
    const known = new Set(sets.flatMap((set) => set.entries.map((entry) => entry.id)))
    const used = [
      ...BOUNDARY_KINDS.map((kind) => kind.icon),
      ...TEMPLATES.flatMap(templateDiagrams).flatMap((diagram) =>
        diagram.nodes.map((node) => ('icon' in node.data ? node.data.icon : '')),
      ),
    ].filter((name) => iconSourceOf(name) !== null)
    expect(used.length).toBeGreaterThan(30)
    expect(used.filter((name) => !known.has(name))).toEqual([])
  })
})
