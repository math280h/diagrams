import { describe, expect, it } from 'vitest'
import type { Diagram } from '@/model/schema'
import { TEMPLATES, templateDiagrams } from '@/templates'
import { ID_KEYS, type Json, withExplicitIds, withImplicitIds } from './link-ids'

const roundTrip = (content: Json) => withExplicitIds(JSON.parse(JSON.stringify(withImplicitIds(content))) as Json)
const eventPipeline = () => TEMPLATES.find((template) => template.id === 'event-pipeline')!.build()

function valuesByKey(content: Json): { key: string; value: string }[] {
  const found: { key: string; value: string }[] = []
  JSON.stringify(content, (key, value: unknown) => {
    if (typeof value === 'string') found.push({ key, value })
    return value
  })
  return found
}

const FORMAT_SAMPLES = import.meta.glob<Json>('../persistence/formats/v*.json', { eager: true, import: 'default' })

function newestFormatSample(): Json {
  const version = (file: string) => Number(/v(\d+)\.json$/.exec(file)?.[1] ?? -1)
  const newest = Object.keys(FORMAT_SAMPLES)
    .toSorted((a, b) => version(a) - version(b))
    .at(-1)!
  return FORMAT_SAMPLES[newest]!
}

function expectIntactReferences(diagram: Diagram) {
  const nodes = new Set(diagram.nodes.map((node) => node.id))
  const edges = new Set(diagram.edges.map((edge) => edge.id))
  expect(new Set([...nodes, ...edges]).size).toBe(nodes.size + edges.size)
  for (const node of diagram.nodes) if (node.parentId) expect(nodes.has(node.parentId)).toBe(true)
  for (const edge of diagram.edges) expect(nodes.has(edge.source) && nodes.has(edge.target)).toBe(true)
  for (const flow of diagram.flows) {
    const steps = new Set(flow.steps.map((step) => step.id))
    for (const step of [...flow.steps, ...(flow.paths ?? []).flatMap((path) => path.steps)]) {
      expect(step.target.kind === 'edge' ? edges.has(step.target.id) : nodes.has(step.target.id)).toBe(true)
    }
    for (const path of flow.paths ?? []) {
      expect(steps.has(path.fromStep)).toBe(true)
      if (path.rejoinStep !== null) expect(steps.has(path.rejoinStep)).toBe(true)
    }
  }
}

describe('implicit ids', () => {
  it('keeps every id key only in the id keys of every template and the newest format sample', () => {
    for (const content of [...TEMPLATES.flatMap((template) => templateDiagrams(template)), newestFormatSample()]) {
      const values = valuesByKey(content)
      const defined = new Set(values.filter(({ key }) => key === 'id').map(({ value }) => value))
      for (const { key, value } of values) if (defined.has(value)) expect(ID_KEYS, `${key}: ${value}`).toContain(key)
    }
  })

  it('stores no id of its own and gives every reference back, also of alternate paths', () => {
    const diagram = eventPipeline()
    const path = diagram.flows[0]!.paths![0]!
    path.rejoinStep = diagram.flows[0]!.steps.at(-1)!.id
    const implicit = JSON.stringify(withImplicitIds(diagram))
    for (const node of diagram.nodes) expect(implicit).not.toContain(node.id)
    expect(implicit).toContain('"id":"n_"')
    const back = roundTrip(diagram) as unknown as Diagram
    expect(back.nodes).toHaveLength(diagram.nodes.length)
    expect(back.flows[0]!.paths![0]!.rejoinStep).not.toBeNull()
    expectIntactReferences(back)
  })

  it('gives ids that stay unique when the diagram already has short ids from an earlier link', () => {
    let text = JSON.stringify(eventPipeline())
    const original = JSON.parse(text) as Diagram
    for (const [index, node] of original.nodes.slice(0, 2).entries())
      text = text.replaceAll(`"${node.id}"`, `"n_${index}"`)
    const diagram = JSON.parse(text) as Diagram
    expect(diagram.nodes[0]!.id).toBe('n_0')
    const back = roundTrip(diagram) as unknown as Diagram
    expect(new Set(back.nodes.map((node) => node.id)).size).toBe(back.nodes.length)
    expectIntactReferences(back)
  })

  it('keeps values that only look like markers or numbered ids, and text outside the id keys', () => {
    const content: Json = {
      nodes: [
        { id: 'n_', title: 'n_4k2j9x0q7a' },
        { id: 'n_5~', parentId: 'n_3' },
        { id: 'orders', parentId: 'n_' },
      ],
      example: 'ord_8f2k',
    }
    expect(roundTrip(content)).toEqual(content)
  })
})
