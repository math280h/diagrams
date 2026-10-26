import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { nodeName } from '@/model/labels'
import { DIAGRAM_VERSION, diagramSchema, type Diagram } from '@/model/schema'
import { migrate } from './migrations'

const FILES = import.meta.glob<unknown>('./formats/*.json', { eager: true, import: 'default' })
const FIRST_SAMPLED_VERSION = 6
const VERSIONS = Array.from(
  { length: DIAGRAM_VERSION - FIRST_SAMPLED_VERSION + 1 },
  (_, index) => FIRST_SAMPLED_VERSION + index,
)
const HOW = 'See "Change the diagram format" in docs/ARCHITECTURE.md.'

function formatFile(name: string): unknown {
  const file = FILES[`./formats/${name}`]
  expect(file, `src/persistence/formats/${name} is missing. ${HOW}`).toBeDefined()
  return file
}

function content(diagram: Diagram) {
  return {
    id: diagram.id,
    name: diagram.name,
    nodes: diagram.nodes.map((node) => [node.id, node.type, node.parentId ?? null, nodeName(node)]),
    edges: diagram.edges.map((edge) => [edge.id, edge.source, edge.target, edge.data.label]),
    flows: diagram.flows.map((flow) => [flow.id, flow.name, flow.steps.map((step) => [step.id, step.target.id])]),
  }
}

describe('diagram formats', () => {
  it('describes the current format in the file of its version', () => {
    expect(z.toJSONSchema(diagramSchema), `The diagram format changed. ${HOW}`).toEqual(
      formatFile(`v${DIAGRAM_VERSION}.schema.json`),
    )
  })

  it.each(VERSIONS)('brings the sample of format %i to the current format and keeps its content', (version) => {
    const sample = formatFile(`v${version}.json`) as { version: number; diagrams: Diagram[] }
    expect(sample.version).toBe(version)
    expect(sample.diagrams.length).toBeGreaterThan(0)
    for (const stored of sample.diagrams) {
      expect(stored.version).toBe(version)
      const migrated = migrate(structuredClone(stored))
      expect(migrated.version).toBe(DIAGRAM_VERSION)
      expect(content(migrated)).toEqual(content(stored))
    }
  })
})
