import { describe, expect, it } from 'vitest'
import { z } from '@/lib/zod'
import { DIAGRAM_VERSION, diagramSchema, type Diagram } from '@/model/schema'
import { currentDiagram, openDiagram } from '@/store/document'
import { serializeDiagram } from './cached-repository'
import { parseDiagramJson } from './library-actions'
import { migrate, migrateElements, REWRITTEN_FIELDS } from './migrations'
import { OLDEST_FORMAT, PREVIEW_FORMATS } from './release-formats'

const FILES = import.meta.glob<unknown>('./formats/*.json', { eager: true, import: 'default' })
const VERSIONS = Array.from({ length: DIAGRAM_VERSION - OLDEST_FORMAT + 1 }, (_, index) => OLDEST_FORMAT + index)
const HOW = 'See "Change the diagram format" in docs/ARCHITECTURE.md.'
const NEW_IDENTITY = new Set(['id', 'rev', 'createdAt', 'updatedAt'])
const FLOAT_TOLERANCE = 1e-9

interface SampleFile {
  version: number
  diagrams: Diagram[]
}

function formatFile(name: string): unknown {
  const file = FILES[`./formats/${name}`]
  expect(file, `src/persistence/formats/${name} is missing. ${HOW}`).toBeDefined()
  return file
}

function samples(version: number): { label: string; diagram: Diagram }[] {
  const kinds = PREVIEW_FORMATS.includes(version) ? [''] : ['', '.fields']
  return kinds.flatMap((kind) => {
    const sample = formatFile(`v${version}${kind}.json`) as SampleFile
    expect(sample.version).toBe(version)
    expect(sample.diagrams.length).toBeGreaterThan(0)
    return sample.diagrams.map((diagram, index) => ({
      label: `v${version}${kind}.json #${index} ${diagram.name}`,
      diagram,
    }))
  })
}

function leaves(value: unknown, path = '', out = new Map<string, unknown>()) {
  if (Array.isArray(value)) {
    if (value.length === 0) out.set(path, '[]')
    const keyed = value.every((item) => typeof item?.id === 'string')
    const ids = keyed ? value.map((item: { id: string }) => item.id) : []
    const unique = new Set(ids).size === ids.length
    value.forEach((item, index) => leaves(item, `${path}[${keyed && unique ? `id=${item.id}` : index}]`, out))
  } else if (typeof value === 'object' && value !== null) {
    if (Object.keys(value).length === 0) out.set(path, '{}')
    for (const [key, child] of Object.entries(value)) leaves(child, path ? `${path}.${key}` : key, out)
  } else out.set(path, value)
  return out
}

const fieldPath = (path: string) => path.replace(/\[[^\]]*\]/g, '[]')

function rewrittenSince(version: number): string[] {
  return Object.entries(REWRITTEN_FIELDS).flatMap(([step, paths]) => (Number(step) > version ? paths : []))
}

const same = (a: unknown, b: unknown) =>
  Object.is(a, b) ||
  (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= FLOAT_TOLERANCE * Math.max(1, Math.abs(a)))

function lostValues(before: unknown, after: unknown, version: number, ignored: ReadonlySet<string> = new Set()) {
  const allowed = rewrittenSince(version)
  const kept = leaves(after)
  const lost: string[] = []
  for (const [path, value] of leaves(before)) {
    const field = fieldPath(path)
    if (path === 'version' || ignored.has(field)) continue
    if (allowed.some((prefix) => field === prefix || field.startsWith(`${prefix}.`) || field.startsWith(`${prefix}[`)))
      continue
    if (!kept.has(path)) lost.push(`${path}: ${JSON.stringify(value)} is gone`)
    else if (!same(kept.get(path), value))
      lost.push(`${path}: ${JSON.stringify(value)} became ${JSON.stringify(kept.get(path))}`)
  }
  return lost
}

describe('diagram formats', () => {
  it('describes the current format in the file of its version', () => {
    expect(z.toJSONSchema(diagramSchema), `The diagram format changed. ${HOW}`).toEqual(
      formatFile(`v${DIAGRAM_VERSION}.schema.json`),
    )
  })

  it.each(VERSIONS)('opens each sample of format %i and keeps every stored value', (version) => {
    for (const { label, diagram } of samples(version)) {
      expect(diagram.version, label).toBe(version)
      const migrated = migrate(structuredClone(diagram))
      expect(migrated.version, label).toBe(DIAGRAM_VERSION)
      expect(lostValues(diagram, migrated, version), `${label}, opened`).toEqual([])
      const imported = parseDiagramJson(JSON.stringify(diagram))
      expect(lostValues(diagram, imported, version, NEW_IDENTITY), `${label}, imported`).toEqual([])
      openDiagram(migrated)
      const saved = migrate(JSON.parse(serializeDiagram(currentDiagram())))
      expect(lostValues(diagram, saved, version, new Set(['updatedAt'])), `${label}, opened and saved`).toEqual([])
      const pasted = migrateElements(structuredClone(diagram.nodes), structuredClone(diagram.edges), version)
      const copied = { nodes: diagram.nodes, edges: diagram.edges }
      expect(lostValues(copied, pasted, version), `${label}, copied and pasted`).toEqual([])
    }
  })
})
