import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { DIAGRAM_VERSION, diagramSchema } from '@/model/schema'
import { TEMPLATES } from '@/templates'
import { parseDiagramJson } from './library-actions'
import { DiagramFormatError, migrate, migrateElements } from './migrations'

type Path = readonly (string | number)[]

function paths(value: unknown, prefix: Path = []): Path[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  const children = Object.entries(value).flatMap(([key, child]) =>
    paths(child, [...prefix, Array.isArray(value) ? Number(key) : key]),
  )
  return [prefix, ...children]
}

function withChange(target: unknown, path: Path, value: unknown): void {
  let parent = target as Record<string | number, unknown>
  for (const key of path.slice(0, -1)) {
    const next = parent[key]
    if (typeof next !== 'object' || next === null) return
    parent = next as Record<string | number, unknown>
  }
  const last = path.at(-1)!
  if (value === undefined) delete parent[last]
  else parent[last] = value
}

function changedCopies(base: object): fc.Arbitrary<unknown> {
  const all = paths(base).filter((path) => path.length > 0)
  const change = fc.record({ path: fc.constantFrom(...all), value: fc.option(fc.jsonValue(), { nil: undefined }) })
  return fc.array(change, { minLength: 1, maxLength: 6 }).map((changes) => {
    const copy = structuredClone(base)
    for (const { path, value } of changes) withChange(copy, path, value)
    return copy
  })
}

function expectDiagramOrFormatError(read: () => unknown): void {
  let diagram: unknown
  try {
    diagram = read()
  } catch (error) {
    expect(error).toBeInstanceOf(DiagramFormatError)
    return
  }
  expect(diagramSchema.safeParse(diagram).success).toBe(true)
}

const template = TEMPLATES.find((candidate) => candidate.id === 'order-system')!.build()

describe('diagram input', () => {
  it('rejects copied nodes of an earlier format with an empty entry', () => {
    expect(() => migrateElements([undefined], {}, 1)).toThrow(
      new DiagramFormatError('The copied nodes use format 1, but the data does not match that format.'),
    )
  })

  it('reads any text as a diagram or rejects it with a format error', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.json(),
          fc.jsonValue().map((value) => JSON.stringify(value)),
        ),
        (text) => expectDiagramOrFormatError(() => parseDiagramJson(text)),
      ),
    )
  })

  it('reads a changed diagram file as a valid diagram or rejects it with a format error', () => {
    fc.assert(
      fc.property(changedCopies(template), (data) =>
        expectDiagramOrFormatError(() => parseDiagramJson(JSON.stringify(data))),
      ),
      { numRuns: 300 },
    )
  })

  it('migrates any value to a valid diagram or rejects it with a format error', () => {
    fc.assert(fc.property(fc.anything(), (value) => expectDiagramOrFormatError(() => migrate(value))))
  })

  it('reads any copied nodes and edges or rejects them with a format error', () => {
    const elements = fc.record({ nodes: fc.anything(), edges: fc.anything() })
    const changed = changedCopies({ nodes: template.nodes, edges: template.edges }) as fc.Arbitrary<{
      nodes: unknown
      edges: unknown
    }>
    fc.assert(
      fc.property(fc.oneof(elements, changed), fc.integer({ min: -1, max: DIAGRAM_VERSION + 1 }), (input, version) => {
        try {
          const result = migrateElements(input.nodes, input.edges, version)
          expect(Array.isArray(result.nodes) && Array.isArray(result.edges)).toBe(true)
        } catch (error) {
          expect(error).toBeInstanceOf(DiagramFormatError)
        }
      }),
      { numRuns: 300 },
    )
  })
})
