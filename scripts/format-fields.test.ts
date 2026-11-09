import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { OLDEST_FORMAT, PREVIEW_FORMATS } from '../src/persistence/release-formats.ts'
import { fieldSamples, missingSlots, sampleValue, schemaSlots, type Json, type Schema } from './format-fields.ts'

const FORMATS = path.join(import.meta.dirname, '..', 'src', 'persistence', 'formats')
const read = (name: string) => JSON.parse(readFileSync(path.join(FORMATS, name), 'utf8')) as { diagrams: Json[] }
const NEWEST_FORMAT = Math.max(
  ...readdirSync(FORMATS)
    .flatMap((name) => /^v(\d+)\.schema\.json$/.exec(name)?.[1] ?? [])
    .map(Number),
)
const RELEASE_FORMATS = Array.from(
  { length: NEWEST_FORMAT - OLDEST_FORMAT + 1 },
  (_, index) => OLDEST_FORMAT + index,
).filter((version) => !PREVIEW_FORMATS.includes(version))

const node: Schema = {
  oneOf: [
    {
      type: 'object',
      properties: {
        id: { type: 'string' },
        type: { type: 'string', const: 'card' },
        parentId: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            status: { type: 'string', enum: ['ok', 'warn'] },
            pinned: { type: 'boolean' },
          },
          required: ['label'],
        },
      },
      required: ['id', 'type', 'data'],
    },
    {
      type: 'object',
      properties: { id: { type: 'string' }, type: { type: 'string', const: 'group' }, data: { type: 'object' } },
      required: ['id', 'type', 'data'],
    },
  ],
}
const schema: Schema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    mode: { type: 'string', enum: ['auto', 'dark'] },
    nodes: { type: 'array', items: node },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, source: { type: 'string' }, target: { type: 'string' } },
        required: ['id', 'source', 'target'],
      },
    },
  },
  required: ['id', 'mode', 'nodes', 'edges'],
}
const base: Json = {
  id: 'd_1',
  mode: 'auto',
  nodes: [
    { id: 'n_1', type: 'card', data: { label: 'API', status: 'ok' } },
    { id: 'n_2', type: 'card', data: { label: 'Database' } },
  ],
  edges: [{ id: 'e_1', source: 'n_1', target: 'n_2' }],
}

describe('schemaSlots', () => {
  it('lists properties, enum values, both boolean values and union branches', () => {
    const names = schemaSlots(schema).map((slot) => slot.name)
    expect(names).toContain('.mode="dark"')
    expect(names).toContain('.nodes[]|type="group"')
    expect(names).toContain('.nodes[]|type="card".data.status="warn"')
    expect(names).toContain('.nodes[]|type="card".data.pinned=false')
    expect(names).toContain('.edges[]')
  })
})

describe('fieldSamples', () => {
  const accepts = (diagram: Json) => diagram

  it('fills every slot and keeps the base diagram as it was', () => {
    const before = structuredClone(base)
    const result = fieldSamples(schema, [base], accepts)
    expect(result.missing).toEqual([])
    expect(base).toEqual(before)
    expect(missingSlots(schema, [base, ...result.diagrams])).toEqual([])
  })

  it('points new references at elements of the right kind', () => {
    interface Sample {
      nodes: { id: string; type: string; parentId?: string }[]
      edges: { source: string }[]
    }
    const result = fieldSamples(schema, [base], accepts) as unknown as { diagrams: Sample[] }
    for (const diagram of result.diagrams) {
      const ids = diagram.nodes.map((item) => item.id)
      const groups = diagram.nodes.filter((item) => item.type === 'group').map((item) => item.id)
      for (const edge of diagram.edges) expect(ids).toContain(edge.source)
      for (const item of diagram.nodes) if (item.parentId) expect(groups).toContain(item.parentId)
    }
  })

  it('leaves out a change that the app refuses, and names the slot', () => {
    const refusesWarn = (diagram: Json) => (JSON.stringify(diagram).includes('"warn"') ? null : diagram)
    expect(fieldSamples(schema, [base], refusesWarn).missing).toEqual(['.nodes[]|type="card".data.status="warn"'])
  })

  it('builds values in the ranges of the schema', () => {
    expect(sampleValue({ type: 'number', minimum: 100, maximum: 60_000 }, () => 'x')).toBe(100)
    expect(sampleValue({ type: 'number', exclusiveMinimum: 0 }, () => 'x')).toBe(1)
    expect(sampleValue({ anyOf: [{ type: 'null' }, { type: 'string' }] }, () => 'x')).toBe('Sample')
  })
})

describe('field samples of the release formats', () => {
  it.each(RELEASE_FORMATS)('fill every slot of the format %i schema', (version) => {
    const file = `v${version}.fields.json`
    expect(existsSync(path.join(FORMATS, file)), `${file} is missing. Run node scripts/format-sample.mjs.`).toBe(true)
    const formatSchema = JSON.parse(readFileSync(path.join(FORMATS, `v${version}.schema.json`), 'utf8')) as Schema
    expect(missingSlots(formatSchema, [...read(`v${version}.json`).diagrams, ...read(file).diagrams])).toEqual([])
  })
})
