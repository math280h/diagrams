import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { COLORS } from './colors'
import { createEdge, defaultCardData } from './defaults'
import { mergeDiagrams, type MergeSide } from './diagram-merge'
import { sortParentsFirst } from './graph'
import { diagramSchema, type Diagram, type StoredEdge, type StoredNode } from './schema'
import { DiagramBuilder, nodeStep } from '@/templates/builder'
import { toStoredEdge } from '@/persistence/serialize'

function shop() {
  const b = new DiagramBuilder()
  const vpc = b.group(0, 0, 640, 320, { label: 'VPC' })
  const api = b.card(40, 60, { title: 'API' }, 216, vpc)
  const db = b.card(360, 60, { title: 'Orders DB' }, 216, vpc)
  const web = b.card(-400, 60, { title: 'Web' })
  b.edge(web, api, { label: 'HTTPS' })
  b.edge(api, db, { label: 'SQL' })
  b.flow('Checkout', [nodeStep(web, 'Opens the shop')])
  const diagram = b.build('Shop')
  return { diagram, vpc, api, db, web }
}

const { diagram: base, vpc, api, db, web } = shop()

function edited(diagram: Diagram, recipe: (draft: Diagram) => void): Diagram {
  const copy = structuredClone(diagram)
  recipe(copy)
  return copy
}

function node(diagram: Diagram, id: string) {
  const found = diagram.nodes.find((candidate) => candidate.id === id)
  if (!found) throw new Error(`no node ${id}`)
  return found
}

function card(diagram: Diagram, id: string) {
  const found = node(diagram, id)
  if (found.type !== 'card') throw new Error(`${id} is not a card`)
  return found
}

function newCard(id: string, title: string, parentId?: string): StoredNode {
  return {
    id,
    type: 'card',
    position: { x: 20, y: 20 },
    width: 216,
    ...(parentId ? { parentId } : {}),
    data: defaultCardData({ title }),
  }
}

function newEdge(source: string, target: string, id: string): StoredEdge {
  return { ...toStoredEdge(createEdge(source, target))!, id }
}

function merged(mine: Diagram, theirs: Diagram, choices = new Map<string, MergeSide>()) {
  const result = mergeDiagrams(base, mine, theirs, choices)
  expect(diagramSchema.safeParse(result.diagram).success).toBe(true)
  return result
}

describe('mergeDiagrams', () => {
  it('takes a change that only one side made', () => {
    const mine = edited(base, (draft) => void (card(draft, api).data.title = 'Gateway'))
    const theirs = edited(base, (draft) => void (node(draft, db).position = { x: 400, y: 100 }))
    const result = merged(mine, theirs)
    expect(result.conflicts).toEqual([])
    expect(card(result.diagram, api).data.title).toBe('Gateway')
    expect(node(result.diagram, db).position).toEqual({ x: 400, y: 100 })
    expect(result.origins.get(`node:${api}`)).toBe('mine')
    expect(result.origins.get(`node:${db}`)).toBe('theirs')
  })

  it('counts the same change on both sides once', () => {
    const rename = (draft: Diagram) => void (card(draft, api).data.title = 'Gateway')
    const result = merged(edited(base, rename), edited(base, rename))
    expect(result.conflicts).toEqual([])
    expect(card(result.diagram, api).data.title).toBe('Gateway')
    expect(result.origins.get(`node:${api}`)).toBe('both')
  })

  it('merges different fields of one node from both sides', () => {
    const mine = edited(base, (draft) => void (card(draft, api).data.title = 'Gateway'))
    const theirs = edited(base, (draft) => {
      node(draft, api).position = { x: 80, y: 120 }
      card(draft, api).data.color = 'teal'
    })
    const result = merged(mine, theirs)
    expect(result.conflicts).toEqual([])
    expect(card(result.diagram, api)).toMatchObject({
      position: { x: 80, y: 120 },
      data: { title: 'Gateway', color: 'teal' },
    })
    expect(result.origins.get(`node:${api}`)).toBe('both')
  })

  it('makes a conflict of a field that both sides changed in different ways, with mine until a choice', () => {
    const mine = edited(base, (draft) => void (card(draft, api).data.title = 'Gateway'))
    const theirs = edited(base, (draft) => {
      card(draft, api).data.title = 'Edge API'
      card(draft, api).data.color = 'pink'
    })
    const result = merged(mine, theirs)
    expect(result.conflicts).toEqual([{ key: `node:${api}`, kind: 'node', id: api, fields: ['data.title'] }])
    expect(card(result.diagram, api).data).toMatchObject({ title: 'Gateway', color: 'pink' })
    expect(result.origins.get(`node:${api}`)).toBe('conflict')

    const chosen = merged(mine, theirs, new Map([[`node:${api}`, 'theirs']]))
    expect(card(chosen.diagram, api).data).toMatchObject({ title: 'Edge API', color: 'pink' })
  })

  it('keeps nodes, edges and flows that either side added, in the order of mine and then theirs', () => {
    const mine = edited(base, (draft) => {
      draft.nodes.push(newCard('n_mine', 'Cache'))
      draft.edges.push(newEdge(api, 'n_mine', 'e_mine'))
    })
    const theirs = edited(base, (draft) => {
      draft.nodes.push(newCard('n_theirs', 'Queue'))
      draft.flows.push({ ...structuredClone(draft.flows[0]!), id: 'f_theirs', name: 'Refund' })
    })
    const result = merged(mine, theirs)
    expect(result.conflicts).toEqual([])
    expect(result.diagram.nodes.map((item) => item.id)).toEqual([
      ...base.nodes.map((item) => item.id),
      'n_mine',
      'n_theirs',
    ])
    expect(result.diagram.edges.map((item) => item.id)).toContain('e_mine')
    expect(result.diagram.flows.map((item) => item.name)).toEqual(['Checkout', 'Refund'])
    expect(result.origins.get('node:n_theirs')).toBe('theirs')
  })

  it('deletes what one side deleted and the other side did not change', () => {
    const theirs = edited(base, (draft) => {
      draft.nodes = draft.nodes.filter((item) => item.id !== web)
      draft.edges = draft.edges.filter((item) => item.source !== web)
    })
    const mine = edited(base, (draft) => void (card(draft, api).data.title = 'Gateway'))
    const result = merged(mine, theirs)
    expect(result.conflicts).toEqual([])
    expect(result.diagram.nodes.some((item) => item.id === web)).toBe(false)
    expect(result.diagram.edges).toHaveLength(1)
  })

  it('makes a conflict of an element that one side deleted and the other side changed', () => {
    const mine = edited(base, (draft) => void (draft.nodes = draft.nodes.filter((item) => item.id !== web)))
    const theirs = edited(base, (draft) => void (card(draft, web).data.title = 'Web app'))
    const result = merged(mine, theirs)
    expect(result.conflicts).toEqual([{ key: `node:${web}`, kind: 'node', id: web, fields: [], deletedBy: 'mine' }])
    expect(result.diagram.nodes.some((item) => item.id === web)).toBe(false)

    const chosen = merged(mine, theirs, new Map([[`node:${web}`, 'theirs']]))
    expect(card(chosen.diagram, web).data.title).toBe('Web app')
  })

  it('merges a flow as one unit', () => {
    const rename = (name: string) => (draft: Diagram) => void (draft.flows[0]!.name = name)
    const loop = (draft: Diagram) => void (draft.flows[0]!.loop = true)
    expect(merged(edited(base, rename('Buy')), base).diagram.flows[0]!.name).toBe('Buy')
    expect(merged(base, edited(base, loop)).diagram.flows[0]!.loop).toBe(true)

    const result = merged(edited(base, rename('Buy')), edited(base, loop))
    const flowId = base.flows[0]!.id
    expect(result.conflicts).toEqual([{ key: `flow:${flowId}`, kind: 'flow', id: flowId, fields: ['steps'] }])
    const chosen = merged(edited(base, rename('Buy')), edited(base, loop), new Map([[`flow:${flowId}`, 'theirs']]))
    expect(chosen.diagram.flows[0]).toMatchObject({ name: 'Checkout', loop: true })
  })

  it('merges the name and the theme field by field', () => {
    const mine = edited(base, (draft) => {
      draft.name = 'Shop v2'
      draft.theme.snap = !base.theme.snap
    })
    const theirs = edited(base, (draft) => void (draft.theme.background = 'grid'))
    const result = merged(mine, theirs)
    expect(result.conflicts).toEqual([])
    expect(result.diagram).toMatchObject({ name: 'Shop v2', theme: { snap: !base.theme.snap, background: 'grid' } })

    const both = merged(
      mine,
      edited(base, (draft) => {
        draft.name = 'Store'
        draft.theme.snap = !base.theme.snap
      }),
    )
    expect(both.conflicts).toEqual([{ key: 'name', kind: 'name', id: '', fields: ['name'] }])
    expect(both.diagram.name).toBe('Shop v2')
  })

  it('drops edges whose node is not in the result, and lists them', () => {
    const mine = edited(base, (draft) => void draft.edges.push(newEdge(web, db, 'e_new')))
    const theirs = edited(base, (draft) => {
      draft.nodes = draft.nodes.filter((item) => item.id !== web)
      draft.edges = draft.edges.filter((item) => item.source !== web)
    })
    const result = merged(mine, theirs)
    expect(result.diagram.edges.map((item) => item.id)).not.toContain('e_new')
    expect(result.droppedEdges.map((item) => item.id)).toEqual(['e_new'])
  })

  it('moves a node to the top level at the same canvas position when its parent is not in the result', () => {
    const mine = edited(base, (draft) => {
      draft.nodes = draft.nodes.filter((item) => ![vpc, api, db].includes(item.id))
      draft.edges = draft.edges.filter((item) => item.target !== api && item.target !== db)
    })
    const theirs = edited(base, (draft) => {
      node(draft, vpc).position = { x: 100, y: 50 }
      draft.nodes.push(newCard('n_inside', 'Worker', vpc))
    })
    const result = merged(mine, theirs, new Map([[`node:${vpc}`, 'mine']]))
    const inside = node(result.diagram, 'n_inside')
    expect(inside.parentId).toBeUndefined()
    expect(inside.position).toEqual({ x: 120, y: 70 })
    expect(result.detachedNodes).toEqual(['n_inside'])
  })

  it('puts a parent before its children', () => {
    const theirs = edited(base, (draft) => {
      draft.nodes.push({ ...node(draft, vpc), id: 'n_zone', parentId: undefined, position: { x: -500, y: 0 } })
      Object.assign(node(draft, web), { parentId: 'n_zone', position: { x: 100, y: 60 } })
    })
    const order = merged(base, theirs).diagram.nodes.map((item) => item.id)
    expect(order.indexOf('n_zone')).toBeLessThan(order.indexOf(web))
  })

  it('breaks a parent loop that the two sides make together', () => {
    const b = new DiagramBuilder()
    const left = b.group(0, 0, 200, 200, { label: 'Left' })
    const right = b.group(400, 0, 200, 200, { label: 'Right' })
    const loopBase = b.build('Loop')
    const mine = edited(loopBase, (draft) => void (node(draft, left).parentId = right))
    const theirs = edited(loopBase, (draft) => void (node(draft, right).parentId = left))
    const result = mergeDiagrams(loopBase, mine, theirs)
    const parents = new Map(result.diagram.nodes.map((item) => [item.id, item.parentId]))
    expect(parents.get(left) === right && parents.get(right) === left).toBe(false)
    expect(result.detachedNodes).toHaveLength(1)
  })

  it('takes the viewport, the measured sizes, the rev and the save time from mine', () => {
    const mine = edited(base, (draft) => {
      draft.viewport = { x: 5, y: 6, zoom: 2 }
      draft.rev = 9
      draft.updatedAt = 1234
      node(draft, api).measured = { width: 216, height: 64 }
    })
    const theirs = edited(base, (draft) => {
      draft.viewport = { x: 50, y: 60, zoom: 0.5 }
      draft.rev = 12
      node(draft, api).measured = { width: 216, height: 80 }
      node(draft, api).position = { x: 0, y: 0 }
    })
    const result = merged(mine, theirs)
    expect(result.conflicts).toEqual([])
    expect(result.diagram).toMatchObject({ viewport: { x: 5, y: 6, zoom: 2 }, rev: 9, updatedAt: 1234 })
    expect(node(result.diagram, api)).toMatchObject({ measured: { width: 216, height: 64 }, position: { x: 0, y: 0 } })
  })

  it('finds no change in a version that only has its keys in another order', () => {
    const reorder = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(reorder)
        : typeof value === 'object' && value !== null
          ? Object.fromEntries(
              Object.entries(value)
                .reverse()
                .map(([key, child]) => [key, reorder(child)]),
            )
          : value
    const mine = edited(base, (draft) => void (card(draft, api).data.title = 'Gateway'))
    const result = merged(mine, reorder(base) as Diagram)
    expect(result.conflicts).toEqual([])
    expect(result.origins.size).toBe(1)
  })
})

type Edit =
  | { kind: 'move'; at: number; dx: number; dy: number }
  | { kind: 'title'; at: number; title: string }
  | { kind: 'color'; at: number; color: (typeof COLORS)[number] }
  | { kind: 'delete'; at: number }
  | { kind: 'add'; id: string; parent: number }
  | { kind: 'connect'; id: string; from: number; to: number }
  | { kind: 'label'; at: number; label: string }
  | { kind: 'reparent'; at: number; parent: number }
  | { kind: 'flow'; name: string }
  | { kind: 'name'; name: string }
  | { kind: 'snap' }

const words = fc.constantFrom('A', 'B', 'C')
const index = fc.nat({ max: 9 })
const editArbitrary: fc.Arbitrary<Edit> = fc.oneof(
  fc.record({
    kind: fc.constant('move'),
    at: index,
    dx: fc.integer({ min: -40, max: 40 }),
    dy: fc.integer({ min: -40, max: 40 }),
  }),
  fc.record({ kind: fc.constant('title'), at: index, title: words }),
  fc.record({ kind: fc.constant('color'), at: index, color: fc.constantFrom(...COLORS) }),
  fc.record({ kind: fc.constant('delete'), at: index }),
  fc.record({ kind: fc.constant('add'), id: fc.constantFrom('n_x', 'n_y', 'n_z'), parent: index }),
  fc.record({ kind: fc.constant('connect'), id: fc.constantFrom('e_x', 'e_y'), from: index, to: index }),
  fc.record({ kind: fc.constant('label'), at: index, label: words }),
  fc.record({ kind: fc.constant('reparent'), at: index, parent: index }),
  fc.record({ kind: fc.constant('flow'), name: words }),
  fc.record({ kind: fc.constant('name'), name: words }),
  fc.record({ kind: fc.constant('snap') }),
)

function descendants(nodes: readonly StoredNode[], id: string): Set<string> {
  const found = new Set([id])
  for (let grew = true; grew;) {
    grew = false
    for (const item of nodes) {
      if (item.parentId && found.has(item.parentId) && !found.has(item.id)) {
        found.add(item.id)
        grew = true
      }
    }
  }
  return found
}

function applyEdit(diagram: Diagram, edit: Edit) {
  const pick = (at: number) => diagram.nodes[at % Math.max(diagram.nodes.length, 1)]
  const groups = diagram.nodes.filter((item) => item.type === 'group')
  const target = 'at' in edit ? pick(edit.at) : undefined
  switch (edit.kind) {
    case 'move':
      if (target) target.position = { x: target.position.x + edit.dx, y: target.position.y + edit.dy }
      return
    case 'title':
      if (target?.type === 'card') target.data.title = edit.title
      return
    case 'color':
      if (target?.type === 'card') target.data.color = edit.color
      return
    case 'delete': {
      if (!target) return
      const removed = descendants(diagram.nodes, target.id)
      diagram.nodes = diagram.nodes.filter((item) => !removed.has(item.id))
      diagram.edges = diagram.edges.filter((item) => !removed.has(item.source) && !removed.has(item.target))
      return
    }
    case 'add': {
      if (diagram.nodes.some((item) => item.id === edit.id)) return
      const parent = groups[edit.parent % (groups.length + 1)]
      diagram.nodes.push(newCard(edit.id, 'New', parent?.id))
      return
    }
    case 'connect': {
      const from = pick(edit.from)
      const to = pick(edit.to)
      if (!from || !to || diagram.edges.some((item) => item.id === edit.id)) return
      diagram.edges.push(newEdge(from.id, to.id, edit.id))
      return
    }
    case 'label': {
      const edge = diagram.edges[edit.at % Math.max(diagram.edges.length, 1)]
      if (edge) edge.data.label = edit.label
      return
    }
    case 'reparent': {
      const parent = groups[edit.parent % (groups.length + 1)]
      if (!target || (parent && descendants(diagram.nodes, target.id).has(parent.id))) return
      if (parent) target.parentId = parent.id
      else delete target.parentId
      return
    }
    case 'flow':
      if (diagram.flows[0]) diagram.flows[0].name = edit.name
      return
    case 'name':
      diagram.name = edit.name
      return
    case 'snap':
      diagram.theme.snap = !diagram.theme.snap
  }
}

function withEdits(diagram: Diagram, edits: readonly Edit[]): Diagram {
  return edited(diagram, (draft) => {
    for (const edit of edits) applyEdit(draft, edit)
    draft.nodes = sortParentsFirst(draft.nodes)
  })
}

function content(diagram: Diagram) {
  const byId = <T extends { id: string }>(items: readonly T[]) => items.toSorted((a, b) => a.id.localeCompare(b.id))
  return {
    name: diagram.name,
    theme: diagram.theme,
    nodes: byId(diagram.nodes.map(({ measured: _measured, ...rest }) => rest)),
    edges: byId(diagram.edges),
    flows: byId(diagram.flows),
  }
}

const edits = fc.array(editArbitrary, { maxLength: 6 })
const sides = fc.record({ start: edits, mine: edits, theirs: edits, pick: fc.array(fc.boolean(), { maxLength: 20 }) })

function scenario({ start, mine, theirs }: { start: Edit[]; mine: Edit[]; theirs: Edit[] }) {
  const from = withEdits(base, start)
  return { from, mine: withEdits(from, mine), theirs: withEdits(from, theirs) }
}

describe('mergeDiagrams properties', () => {
  it('gives mine when theirs did not change', () => {
    fc.assert(
      fc.property(sides, (input) => {
        const { from, mine } = scenario(input)
        const result = mergeDiagrams(from, mine, from)
        expect(result.conflicts).toEqual([])
        expect(result.diagram).toEqual(mine)
      }),
    )
  })

  it('gives the content of theirs when mine did not change', () => {
    fc.assert(
      fc.property(sides, (input) => {
        const { from, theirs } = scenario(input)
        const result = mergeDiagrams(from, from, theirs)
        expect(result.conflicts).toEqual([])
        expect(content(result.diagram)).toEqual(content(theirs))
      }),
    )
  })

  it('gives the same content with the sides swapped when there is no conflict', () => {
    fc.assert(
      fc.property(sides, (input) => {
        const { from, mine, theirs } = scenario(input)
        const forward = mergeDiagrams(from, mine, theirs)
        fc.pre(forward.conflicts.length === 0)
        expect(content(mergeDiagrams(from, theirs, mine).diagram)).toEqual(content(forward.diagram))
      }),
    )
  })

  it('always gives a valid diagram with parents before their children', () => {
    fc.assert(
      fc.property(sides, (input) => {
        const { from, mine, theirs } = scenario(input)
        const conflicts = mergeDiagrams(from, mine, theirs).conflicts
        const choices = new Map(
          conflicts.map((conflict, at): [string, MergeSide] => [conflict.key, input.pick[at] ? 'theirs' : 'mine']),
        )
        const { diagram } = mergeDiagrams(from, mine, theirs, choices)
        expect(diagramSchema.safeParse(diagram).success).toBe(true)
        const seen = new Set<string>()
        for (const item of diagram.nodes) {
          if (item.parentId !== undefined) expect(seen.has(item.parentId)).toBe(true)
          seen.add(item.id)
        }
        for (const edge of diagram.edges) expect(seen.has(edge.source) && seen.has(edge.target)).toBe(true)
      }),
    )
  })
})
