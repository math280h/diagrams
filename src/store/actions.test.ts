import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createDiagram,
  createEdge,
  DEFAULT_THEME,
  defaultGroupData,
  defaultPayloadField,
  defaultShapeData,
  defaultTextData,
  newId,
} from '@/model/defaults'
import { absolutePosition, ELEMENT_Z } from '@/model/graph'
import { PRESET_BY_ID } from '@/model/presets'
import type { Diagram, Step, XY } from '@/model/schema'
import type { DiagramEdge, DiagramNode } from '@/model/types'
import { toStoredNode } from '@/persistence/serialize'
import {
  addFlow,
  addNodes,
  alignSelection,
  applyLayoutResult,
  arrangeSelection,
  cloneSubgraph,
  colorNodes,
  deleteElements,
  deleteFlow,
  deleteSelection,
  detachedSelection,
  distributeSelection,
  duplicateFlow,
  duplicateSelection,
  groupNodes,
  groupSelection,
  moveBendsAfterDrag,
  nudgeSelection,
  onConnect,
  onEdgesChange,
  onNodesChange,
  patchNodesData,
  pinNodes,
  reparentAfterDrag,
  resetEdgeRoutes,
  restoreContent,
  reverseEdge,
  selectAll,
  selectedIds,
  selectionPinned,
  selectOnly,
  setEdgePayload,
  setEdgeSides,
  setName,
  setTheme,
  setViewport,
  fitGroupsToChildren,
  setNodeFrames,
  snapAfterDrag,
  ungroupNodes,
  ungroupSelection,
  updateEdgeData,
  updateEdges,
  updateEdgesData,
  updateEdgesTraffic,
  updateFlow,
  updateNodeData,
  type NodeDataPatch,
} from './actions'
import { useDoc } from './doc-store'
import { redo, resetHistory, undo, useHistory } from './history'

function groupNode(x: number, y: number, width: number, height: number, parentId?: string): DiagramNode {
  return {
    id: newId('n'),
    type: 'group',
    position: { x, y },
    width,
    height,
    parentId,
    zIndex: -1,
    data: defaultGroupData(),
  }
}

function card(x: number, y: number): DiagramNode {
  const node = PRESET_BY_ID.get('service')!.create({ x, y })
  return { ...node, measured: { width: 200, height: 80 } }
}

function shapeNode(x: number, y: number): DiagramNode {
  return {
    id: newId('n'),
    type: 'shape',
    position: { x, y },
    width: 160,
    height: 72,
    zIndex: ELEMENT_Z,
    data: defaultShapeData(),
  }
}

function textNode(x: number, y: number): DiagramNode {
  return { id: newId('n'), type: 'text', position: { x, y }, zIndex: ELEMENT_Z, data: defaultTextData() }
}

function bentEdge(source: string, target: string, bends: XY[]): DiagramEdge {
  return createEdge(source, target, { bends })
}

function nodeById(id: string): DiagramNode {
  return useDoc.getState().nodes.find((node) => node.id === id)!
}

function edgeById(id: string): DiagramEdge {
  return useDoc.getState().edges.find((edge) => edge.id === id)!
}

function canvasPosition(id: string): XY {
  const byId = new Map(useDoc.getState().nodes.map((node) => [node.id, node]))
  return absolutePosition(byId.get(id)!, byId)
}

function canUndo() {
  return useHistory.getState().canUndo
}

let clockMs = 1000

function waitPastMerge() {
  clockMs += 10_000
}

beforeEach(() => {
  useDoc.setState({ name: 'Start', theme: DEFAULT_THEME, nodes: [], edges: [], flows: [] })
  resetHistory()
  clockMs = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => clockMs)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('groupSelection', () => {
  it('wraps the selection in a group and keeps the absolute positions', () => {
    const a = card(100, 100)
    const b = card(400, 220)
    useDoc.setState({ nodes: [a, b] })
    selectOnly([a.id, b.id])
    groupSelection()

    const { nodes } = useDoc.getState()
    const group = nodes.find((node) => node.type === 'group')!
    expect(nodes[0]!.id).toBe(group.id)
    const byId = new Map(nodes.map((node) => [node.id, node]))
    expect(absolutePosition(byId.get(a.id)!, byId)).toEqual({ x: 100, y: 100 })
    expect(absolutePosition(byId.get(b.id)!, byId)).toEqual({ x: 400, y: 220 })
    expect(group.width).toBeGreaterThan(500)
  })

  it('removes the group and keeps the absolute positions on ungroup', () => {
    const a = card(100, 100)
    const b = card(400, 220)
    useDoc.setState({ nodes: [a, b] })
    selectOnly([a.id, b.id])
    groupSelection()
    const group = useDoc.getState().nodes.find((node) => node.type === 'group')!
    selectOnly([group.id])
    ungroupSelection()

    const { nodes } = useDoc.getState()
    expect(nodes.some((node) => node.type === 'group')).toBe(false)
    expect(nodes.find((node) => node.id === a.id)!.position).toEqual({ x: 100, y: 100 })
    expect(nodes.find((node) => node.id === b.id)!.parentId).toBeUndefined()
  })
})

describe('align and distribute', () => {
  it('aligns the left edges', () => {
    useDoc.setState({ nodes: [card(10, 0), card(60, 200), card(30, 400)] })
    selectOnly(useDoc.getState().nodes.map((node) => node.id))
    alignSelection('left')
    expect(useDoc.getState().nodes.map((node) => node.position.x)).toEqual([10, 10, 10])
  })

  it('makes equal gaps between three nodes', () => {
    useDoc.setState({ nodes: [card(0, 0), card(250, 0), card(1000, 0)] })
    selectOnly(useDoc.getState().nodes.map((node) => node.id))
    distributeSelection('x')
    expect(useDoc.getState().nodes.map((node) => node.position.x)).toEqual([0, 500, 1000])
  })
})

describe('groupNodes', () => {
  it('groups nodes by id and keeps the selection', () => {
    const a = card(100, 100)
    const b = card(400, 220)
    useDoc.setState({ nodes: [a, { ...b, selected: true }] })
    const groupId = groupNodes([a.id, b.id], { label: 'VPC' })

    const { nodes } = useDoc.getState()
    const group = nodes.find((node) => node.id === groupId)!
    expect(group.type === 'group' && group.data.label).toBe('VPC')
    expect(group.selected).toBe(false)
    expect(nodes.find((node) => node.id === b.id)!.selected).toBe(true)
  })

  it('returns null for nodes with different parents', () => {
    const a = card(100, 100)
    const b = { ...card(400, 220), parentId: 'missing' }
    useDoc.setState({ nodes: [a, b] })
    expect(groupNodes([a.id, b.id])).toBeNull()
  })
})

describe('setNodeFrames', () => {
  it('moves a node into a group and keeps its canvas position', () => {
    const a = card(100, 100)
    const b = card(400, 220)
    useDoc.setState({ nodes: [a, b] })
    const groupId = groupNodes([a.id])!
    setNodeFrames([{ id: b.id, parentId: groupId }])

    const { nodes } = useDoc.getState()
    const byId = new Map(nodes.map((node) => [node.id, node]))
    expect(byId.get(b.id)!.parentId).toBe(groupId)
    expect(absolutePosition(byId.get(b.id)!, byId)).toEqual({ x: 400, y: 220 })
  })

  it('places a node at canvas coordinates inside its parent', () => {
    const a = card(100, 100)
    useDoc.setState({ nodes: [a] })
    const groupId = groupNodes([a.id])!
    setNodeFrames([{ id: a.id, x: 160, y: 180, width: 240 }])

    const { nodes } = useDoc.getState()
    const byId = new Map(nodes.map((node) => [node.id, node]))
    expect(absolutePosition(byId.get(a.id)!, byId)).toEqual({ x: 160, y: 180 })
    expect(byId.get(a.id)!.width).toBe(240)
    expect(byId.get(a.id)!.parentId).toBe(groupId)
  })

  it('does not put a group inside its own child', () => {
    const a = card(100, 100)
    useDoc.setState({ nodes: [a] })
    const groupId = groupNodes([a.id])!
    setNodeFrames([{ id: groupId, parentId: a.id }])
    expect(useDoc.getState().nodes.find((node) => node.id === groupId)!.parentId).toBeUndefined()
  })
})

describe('deleteElements', () => {
  it('removes a group with its children and their edges', () => {
    const a = card(100, 100)
    const b = card(400, 220)
    const c = card(700, 220)
    useDoc.setState({ nodes: [a, b, c], edges: [createEdge(b.id, c.id)] })
    const groupId = groupNodes([a.id, b.id])!
    deleteElements([groupId])
    expect(useDoc.getState().nodes.map((node) => node.id)).toEqual([c.id])
    expect(useDoc.getState().edges).toHaveLength(0)
  })
})

describe('ungroupNodes', () => {
  function nested() {
    const outer = groupNode(100, 100, 600, 400)
    const inner = groupNode(40, 60, 300, 200, outer.id)
    const child = { ...card(32, 56), parentId: inner.id }
    const other = card(900, 100)
    return { outer, inner, child, other }
  }

  it('moves a child of nested removed groups to the top level and keeps its place', () => {
    const { outer, inner, child, other } = nested()
    useDoc.setState({ nodes: [outer, inner, child, other] })
    ungroupNodes([outer.id, inner.id])
    const nodes = useDoc.getState().nodes
    expect(nodes.map((node) => node.id).toSorted()).toEqual([child.id, other.id].toSorted())
    const moved = nodes.find((node) => node.id === child.id)!
    expect(moved.parentId).toBeUndefined()
    expect(moved.position).toEqual({ x: 172, y: 216 })
  })

  it('moves a child to the nearest group that stays', () => {
    const { outer, inner, child } = nested()
    useDoc.setState({ nodes: [outer, inner, child] })
    ungroupNodes([inner.id])
    const moved = useDoc.getState().nodes.find((node) => node.id === child.id)!
    expect(moved.parentId).toBe(outer.id)
    expect(moved.position).toEqual({ x: 72, y: 116 })
  })

  it('removes the edges that end at a removed group', () => {
    const { outer, inner, child, other } = nested()
    const toGroup = createEdge(other.id, outer.id)
    const toChild = createEdge(other.id, child.id)
    useDoc.setState({ nodes: [outer, inner, child, other], edges: [toGroup, toChild] })
    ungroupNodes([outer.id, inner.id])
    expect(useDoc.getState().edges.map((edge) => edge.id)).toEqual([toChild.id])
  })
})

describe('fitGroupsToChildren', () => {
  it('grows a group to the left and up around its children and keeps their canvas place', () => {
    const box = groupNode(100, 100, 400, 300)
    const child = { ...card(-20, 10), parentId: box.id }
    useDoc.setState({ nodes: [box, child] })
    fitGroupsToChildren([box.id])
    const nodes = useDoc.getState().nodes
    const byId = new Map(nodes.map((node) => [node.id, node]))
    const grown = byId.get(box.id)!
    expect(grown.position).toEqual({ x: 48, y: 54 })
    expect(grown.width).toBe(452)
    expect(grown.height).toBe(346)
    expect(absolutePosition(byId.get(child.id)!, byId)).toEqual({ x: 80, y: 110 })
  })

  it('grows the groups around a group that grew', () => {
    const outer = groupNode(0, 0, 600, 300)
    const inner = groupNode(40, 60, 300, 200, outer.id)
    const child = { ...card(32, 180), parentId: inner.id }
    useDoc.setState({ nodes: [outer, inner, child] })
    fitGroupsToChildren([inner.id])
    const byId = new Map(useDoc.getState().nodes.map((node) => [node.id, node]))
    expect(byId.get(inner.id)!.height).toBe(180 + 80 + 32)
    expect(byId.get(outer.id)!.height).toBe(60 + 292 + 32)
    expect(absolutePosition(byId.get(child.id)!, byId)).toEqual({ x: 72, y: 240 })
  })

  it('leaves groups that already hold their children alone', () => {
    const box = groupNode(0, 0, 400, 300)
    const child = { ...card(40, 80), parentId: box.id }
    useDoc.setState({ nodes: [box, child] })
    const before = useDoc.getState().nodes
    fitGroupsToChildren([box.id])
    expect(useDoc.getState().nodes).toBe(before)
  })

  it('grows the groups in one undo step', () => {
    const box = groupNode(100, 100, 400, 300)
    const child = { ...card(-20, 10), parentId: box.id }
    useDoc.setState({ nodes: [box, child] })
    fitGroupsToChildren([box.id])
    undo()
    expect(nodeById(box.id)).toMatchObject({ position: { x: 100, y: 100 }, width: 400, height: 300 })
    expect(canUndo()).toBe(false)
  })
})

describe('React Flow changes', () => {
  it('records a remove as an undo step', () => {
    const a = card(0, 0)
    addNodes([a], [], false)
    resetHistory()
    onNodesChange([{ type: 'remove', id: a.id }])
    expect(useDoc.getState().nodes).toHaveLength(0)
    undo()
    expect(useDoc.getState().nodes.map((node) => node.id)).toEqual([a.id])
  })

  it('records a keyboard move of React Flow, and no step for each drag frame', () => {
    const a = card(0, 0)
    addNodes([a], [], false)
    resetHistory()
    onNodesChange([{ type: 'position', id: a.id, position: { x: 20, y: 0 }, dragging: true }])
    expect(canUndo()).toBe(false)
    onNodesChange([{ type: 'position', id: a.id, position: { x: 40, y: 0 }, dragging: false }])
    expect(nodeById(a.id).position).toEqual({ x: 40, y: 0 })
    undo()
    expect(nodeById(a.id).position).toEqual({ x: 20, y: 0 })
  })

  it('removes an edge as an undo step', () => {
    const a = card(0, 0)
    const b = card(400, 0)
    const edge = createEdge(a.id, b.id)
    useDoc.setState({ nodes: [a, b], edges: [edge] })
    onEdgesChange([{ type: 'remove', id: edge.id }])
    expect(useDoc.getState().edges).toHaveLength(0)
    undo()
    expect(useDoc.getState().edges.map((item) => item.id)).toEqual([edge.id])
  })

  it('does not record an edge selection', () => {
    const a = card(0, 0)
    const b = card(400, 0)
    const edge = createEdge(a.id, b.id)
    useDoc.setState({ nodes: [a, b], edges: [edge] })
    onEdgesChange([{ type: 'select', id: edge.id, selected: true }])
    expect(edgeById(edge.id).selected).toBe(true)
    expect(canUndo()).toBe(false)
  })

  it('connects two nodes at the sides of the connection', () => {
    const a = card(0, 0)
    const b = card(400, 0)
    useDoc.setState({ nodes: [a, b] })
    onConnect({ source: a.id, target: b.id, sourceHandle: 'right', targetHandle: 'left' })
    const [edge] = useDoc.getState().edges
    expect(edge).toMatchObject({ source: a.id, target: b.id, sourceHandle: 'right', targetHandle: 'left' })
    expect(edge!.data).toMatchObject({ path: 'smooth', markerEnd: 'arrow' })
    undo()
    expect(useDoc.getState().edges).toHaveLength(0)
  })

  it('does not connect a node to itself', () => {
    const a = card(0, 0)
    useDoc.setState({ nodes: [a] })
    onConnect({ source: a.id, target: a.id, sourceHandle: null, targetHandle: null })
    expect(useDoc.getState().edges).toHaveLength(0)
    expect(canUndo()).toBe(false)
  })
})

describe('addNodes', () => {
  it('selects only the new nodes and puts parents first', () => {
    const old = { ...card(0, 0), selected: true }
    const other = card(0, 300)
    const oldEdge = { ...createEdge(old.id, other.id), selected: true }
    useDoc.setState({ nodes: [old, other], edges: [oldEdge] })
    const box = groupNode(600, 0, 400, 300)
    const child = { ...card(40, 80), parentId: box.id }
    addNodes([child, box])

    const { nodes, edges } = useDoc.getState()
    expect(nodes.map((node) => node.id)).toEqual([old.id, other.id, box.id, child.id])
    expect(nodes.filter((node) => node.selected).map((node) => node.id)).toEqual([box.id, child.id])
    expect(edges[0]!.selected).toBe(false)
  })

  it('keeps the selection when it does not select the new nodes', () => {
    const old = { ...card(0, 0), selected: true }
    useDoc.setState({ nodes: [old] })
    const added = card(400, 0)
    addNodes([added], [], false)
    expect(nodeById(old.id).selected).toBe(true)
    expect(nodeById(added.id).selected).toBe(false)
  })
})

describe('node and edge data', () => {
  it('merges a patch into the node data and undoes it', () => {
    const a = card(0, 0)
    useDoc.setState({ nodes: [a] })
    updateNodeData(a.id, { title: 'Orders', badge: 'v2' })
    expect(nodeById(a.id).data).toMatchObject({ title: 'Orders', badge: 'v2', form: 'service' })
    undo()
    expect(nodeById(a.id).data).toMatchObject({ title: 'Service', badge: '' })
  })

  it('refuses a field that the node type does not have', () => {
    const label = textNode(0, 0)
    useDoc.setState({ nodes: [label] })
    expect(() => updateNodeData(label.id, { title: 'Nope' })).toThrow('A text node has no "title" field.')
    expect(nodeById(label.id).data).toEqual(defaultTextData())
    expect(canUndo()).toBe(false)
  })

  it('makes separate undo steps for edits with the same key that are far apart in time', () => {
    const a = card(0, 0)
    useDoc.setState({ nodes: [a] })
    updateNodeData(a.id, { title: 'A' })
    updateNodeData(a.id, { title: 'AB' })
    waitPastMerge()
    updateNodeData(a.id, { title: 'ABC' })
    undo()
    expect(nodeById(a.id).data).toMatchObject({ title: 'AB' })
    undo()
    expect(nodeById(a.id).data).toMatchObject({ title: 'Service' })
  })

  it('merges a patch into the data of the given edges only', () => {
    const [a, b, c] = [card(0, 0), card(400, 0), card(800, 0)]
    const first = createEdge(a.id, b.id)
    const second = createEdge(b.id, c.id)
    const third = createEdge(a.id, c.id)
    useDoc.setState({ nodes: [a, b, c], edges: [first, second, third] })
    updateEdgesData(new Set([first.id, second.id]), { stroke: 'dashed' })
    updateEdgeData(third.id, { label: 'HTTPS' })
    expect(useDoc.getState().edges.map((edge) => edge.data!.stroke)).toEqual(['dashed', 'dashed', 'solid'])
    expect(edgeById(third.id).data).toMatchObject({ label: 'HTTPS', markerEnd: 'arrow' })
    undo()
    expect(edgeById(third.id).data!.label).toBe('')
    undo()
    expect(edgeById(first.id).data!.stroke).toBe('solid')
  })

  it('merges a patch into the traffic of the given edges', () => {
    const [a, b] = [card(0, 0), card(400, 0)]
    const edge = createEdge(a.id, b.id)
    const other = createEdge(b.id, a.id)
    useDoc.setState({ nodes: [a, b], edges: [edge, other] })
    updateEdgesTraffic(new Set([edge.id]), { enabled: true, speed: 140 })
    expect(edgeById(edge.id).data!.traffic).toMatchObject({ enabled: true, speed: 140, style: 'dots' })
    expect(edgeById(other.id).data!.traffic.enabled).toBe(false)
  })

  it('sets the request body of an edge and removes it with no fields', () => {
    const [a, b] = [card(0, 0), card(400, 0)]
    const edge = createEdge(a.id, b.id)
    useDoc.setState({ nodes: [a, b], edges: [edge] })
    const orderId = defaultPayloadField({ path: 'orderId' })
    const status = defaultPayloadField({ path: 'status' })
    setEdgePayload(edge.id, 'request', [orderId])
    setEdgePayload(edge.id, 'response', [status])
    expect(edgeById(edge.id).data!.request?.fields).toEqual([orderId])

    setEdgePayload(edge.id, 'request', [])
    expect(edgeById(edge.id).data).not.toHaveProperty('request')
    expect(edgeById(edge.id).data!.response?.fields).toEqual([status])
  })

  it('sets the sides of an edge', () => {
    const [a, b] = [card(0, 0), card(400, 0)]
    const edge = createEdge(a.id, b.id)
    useDoc.setState({ nodes: [a, b], edges: [edge] })
    setEdgeSides(edge.id, 'bottom', 'top')
    expect(edgeById(edge.id)).toMatchObject({ sourceHandle: 'bottom', targetHandle: 'top' })
    undo()
    expect(edgeById(edge.id)).toMatchObject({ sourceHandle: null, targetHandle: null })
  })

  it('reverses an edge with its sides', () => {
    const [a, b] = [card(0, 0), card(400, 0)]
    const edge = createEdge(a.id, b.id, {}, { sourceHandle: 'right', targetHandle: 'left' })
    useDoc.setState({ nodes: [a, b], edges: [edge] })
    reverseEdge(edge.id)
    expect(edgeById(edge.id)).toMatchObject({
      source: b.id,
      target: a.id,
      sourceHandle: 'left',
      targetHandle: 'right',
    })
    undo()
    expect(edgeById(edge.id)).toMatchObject({ source: a.id, target: b.id, sourceHandle: 'right' })
  })
})

describe('updateEdges', () => {
  function threeNodes() {
    const [a, b, c] = [card(0, 0), card(400, 0), card(800, 0)]
    const edge = createEdge(a.id, b.id, { sides: 'fixed' }, { sourceHandle: 'right', targetHandle: 'left' })
    const other = createEdge(b.id, c.id)
    useDoc.setState({ nodes: [a, b, c], edges: [edge, other] })
    return { a, b, c, edge, other }
  }

  it('moves the ends of an edge and keeps its sides', () => {
    const { a, c, edge, other } = threeNodes()
    const before = edgeById(other.id)
    updateEdges([{ id: edge.id, source: c.id, target: a.id, data: { label: 'Reply' }, sides: null }])
    expect(edgeById(edge.id)).toMatchObject({ source: c.id, target: a.id, sourceHandle: 'right', targetHandle: 'left' })
    expect(edgeById(edge.id).data).toMatchObject({ label: 'Reply', sides: 'fixed' })
    expect(edgeById(other.id)).toBe(before)
  })

  it('lets the canvas choose the sides again', () => {
    const { a, b, edge } = threeNodes()
    updateEdges([{ id: edge.id, source: a.id, target: b.id, data: {}, sides: 'auto' }])
    expect(edgeById(edge.id)).toMatchObject({ sourceHandle: null, targetHandle: null })
    expect(edgeById(edge.id).data!.sides).toBe('auto')
  })

  it('fixes the ends to the given sides', () => {
    const { b, c, other } = threeNodes()
    updateEdges([
      { id: other.id, source: b.id, target: c.id, data: {}, sides: { sourceHandle: 'bottom', targetHandle: 'top' } },
    ])
    expect(edgeById(other.id)).toMatchObject({ sourceHandle: 'bottom', targetHandle: 'top' })
    expect(edgeById(other.id).data!.sides).toBe('fixed')
  })

  it('records no undo step without updates', () => {
    threeNodes()
    updateEdges([])
    expect(canUndo()).toBe(false)
  })
})

describe('diagram name, theme and view', () => {
  it('renames the diagram and changes the theme as undo steps', () => {
    setName('Shop')
    setTheme({ mode: 'dark' })
    setTheme({ snap: false })
    expect(useDoc.getState().theme).toEqual({ ...DEFAULT_THEME, mode: 'dark', snap: false })
    undo()
    expect(useDoc.getState().theme).toEqual(DEFAULT_THEME)
    expect(useDoc.getState().name).toBe('Shop')
    undo()
    expect(useDoc.getState().name).toBe('Start')
  })

  it('sets the viewport without an undo step', () => {
    setViewport({ x: 40, y: -20, zoom: 1.5 })
    expect(useDoc.getState().viewport).toEqual({ x: 40, y: -20, zoom: 1.5 })
    expect(canUndo()).toBe(false)
  })

  it('replaces the content with an older version as one undo step', () => {
    const current = card(0, 0)
    addNodes([current])
    const older = card(300, 100)
    const version: Diagram = {
      ...createDiagram('Older'),
      theme: { ...DEFAULT_THEME, mode: 'light' },
      nodes: [toStoredNode(older)],
    }
    restoreContent(version)
    expect(useDoc.getState().name).toBe('Older')
    expect(useDoc.getState().theme.mode).toBe('light')
    expect(useDoc.getState().nodes.map((node) => node.id)).toEqual([older.id])

    undo()
    expect(useDoc.getState().name).toBe('Start')
    expect(useDoc.getState().nodes.map((node) => node.id)).toEqual([current.id])
    redo()
    expect(useDoc.getState().nodes.map((node) => node.id)).toEqual([older.id])
  })
})

describe('selection', () => {
  it('selects all nodes and edges and reports their ids', () => {
    const [a, b] = [card(0, 0), card(400, 0)]
    const edge = createEdge(a.id, b.id)
    useDoc.setState({ nodes: [a, b], edges: [edge] })
    selectAll()
    expect(selectedIds()).toEqual({ nodes: new Set([a.id, b.id]), edges: new Set([edge.id]) })
    expect(canUndo()).toBe(false)
  })

  it('selects only the given nodes and edges', () => {
    const [a, b] = [{ ...card(0, 0), selected: true }, card(400, 0)]
    const edge = createEdge(a.id, b.id)
    useDoc.setState({ nodes: [a, b], edges: [edge] })
    selectOnly([b.id], [edge.id])
    expect(selectedIds()).toEqual({ nodes: new Set([b.id]), edges: new Set([edge.id]) })
  })

  it('deletes the selected nodes and edges, and the edges of deleted nodes', () => {
    const [a, b, c] = [card(0, 0), card(400, 0), card(800, 0)]
    const ab = createEdge(a.id, b.id)
    const bc = createEdge(b.id, c.id)
    const ca = createEdge(c.id, a.id)
    useDoc.setState({ nodes: [a, b, c], edges: [ab, bc, ca] })
    selectOnly([b.id], [ca.id])
    deleteSelection()
    expect(useDoc.getState().nodes.map((node) => node.id)).toEqual([a.id, c.id])
    expect(useDoc.getState().edges).toEqual([])
    undo()
    expect(useDoc.getState().edges.map((edge) => edge.id)).toEqual([ab.id, bc.id, ca.id])
  })

  it('records no undo step when nothing is selected for a delete', () => {
    useDoc.setState({ nodes: [card(0, 0)] })
    deleteSelection()
    expect(useDoc.getState().nodes).toHaveLength(1)
    expect(canUndo()).toBe(false)
  })

  it('gives a selected child without its group its canvas position', () => {
    const box = groupNode(100, 100, 400, 300)
    const child = { ...card(40, 60), parentId: box.id }
    const sibling = { ...card(240, 60), parentId: box.id }
    useDoc.setState({ nodes: [box, child, sibling], edges: [createEdge(child.id, sibling.id)] })
    selectOnly([child.id])
    const { nodes, edges } = detachedSelection()
    expect(nodes).toEqual([
      expect.objectContaining({ id: child.id, parentId: undefined, position: { x: 140, y: 160 } }),
    ])
    expect(edges).toEqual([])
  })

  it('keeps a selected group with its children as they are', () => {
    const box = groupNode(100, 100, 400, 300)
    const child = { ...card(40, 60), parentId: box.id }
    useDoc.setState({ nodes: [box, child] })
    selectOnly([box.id])
    const { nodes } = detachedSelection()
    expect(nodes.map((node) => [node.id, node.parentId, node.position])).toEqual([
      [box.id, undefined, { x: 100, y: 100 }],
      [child.id, box.id, { x: 40, y: 60 }],
    ])
  })
})

describe('cloneSubgraph', () => {
  it('copies nodes with new ids, keeps the inner structure and moves only the top level', () => {
    const box = groupNode(100, 100, 600, 300)
    const first = { ...card(40, 60), parentId: box.id }
    const second = { ...card(300, 60), parentId: box.id }
    const outside = card(900, 100)
    const inner = createEdge(first.id, second.id)
    const leaving = createEdge(second.id, outside.id)

    const copy = cloneSubgraph([box, first, second], [inner, leaving], { x: 10, y: 20 })

    const originalIds = new Set([box.id, first.id, second.id])
    expect(copy.nodes.every((node) => !originalIds.has(node.id) && node.selected)).toBe(true)
    const [boxCopy, firstCopy, secondCopy] = copy.nodes
    expect(boxCopy!.position).toEqual({ x: 110, y: 120 })
    expect(firstCopy).toMatchObject({ parentId: boxCopy!.id, position: { x: 40, y: 60 } })
    expect(secondCopy!.parentId).toBe(boxCopy!.id)
    expect(copy.edges).toHaveLength(1)
    expect(copy.edges[0]).toMatchObject({ source: firstCopy!.id, target: secondCopy!.id, selected: false })
    expect(copy.edges[0]!.id).not.toBe(inner.id)
  })

  it('makes copies that do not share data with the originals', () => {
    const original = card(0, 0)
    const copy = cloneSubgraph([original], [], { x: 0, y: 0 }).nodes[0]!
    expect(copy.data).toEqual(original.data)
    expect(copy.data).not.toBe(original.data)
  })
})

describe('duplicateSelection', () => {
  it('copies the selection next to it and selects the copy', () => {
    const [a, b] = [card(0, 0), card(400, 0)]
    useDoc.setState({ nodes: [a, b], edges: [createEdge(a.id, b.id)] })
    selectOnly([a.id, b.id])
    duplicateSelection()

    const { nodes, edges } = useDoc.getState()
    expect(nodes).toHaveLength(4)
    expect(edges).toHaveLength(2)
    const copies = nodes.filter((node) => node.selected)
    expect(copies.map((node) => node.position)).toEqual([
      { x: 32, y: 32 },
      { x: 432, y: 32 },
    ])
    expect(nodeById(a.id).selected).toBe(false)
    undo()
    expect(useDoc.getState().nodes).toHaveLength(2)
  })

  it('copies a child into the same group', () => {
    const box = groupNode(0, 0, 600, 400)
    const child = { ...card(40, 60), parentId: box.id }
    useDoc.setState({ nodes: [box, child] })
    selectOnly([child.id])
    duplicateSelection()
    const copy = useDoc.getState().nodes.find((node) => node.selected)!
    expect(copy).toMatchObject({ parentId: box.id, position: { x: 72, y: 92 } })
  })

  it('does nothing without a selection', () => {
    useDoc.setState({ nodes: [card(0, 0)] })
    duplicateSelection()
    expect(useDoc.getState().nodes).toHaveLength(1)
    expect(canUndo()).toBe(false)
  })
})

describe('grouping', () => {
  it('selects only the new group when it groups the selection', () => {
    const [a, b, c] = [card(100, 100), card(400, 220), card(900, 0)]
    useDoc.setState({ nodes: [a, b, c] })
    selectOnly([a.id, b.id])
    expect(groupSelection({ label: 'Backend' })).toBe(true)
    const selected = useDoc.getState().nodes.filter((node) => node.selected)
    expect(selected).toEqual([
      expect.objectContaining({ type: 'group', data: expect.objectContaining({ label: 'Backend' }) }),
    ])
    undo()
    expect(useDoc.getState().nodes.some((node) => node.type === 'group')).toBe(false)
  })

  it('makes no group without a selection', () => {
    useDoc.setState({ nodes: [card(0, 0)] })
    expect(groupSelection()).toBe(false)
    expect(groupNodes([])).toBeNull()
    expect(canUndo()).toBe(false)
  })

  it('puts a new group inside the group of its nodes and keeps their canvas places', () => {
    const outer = groupNode(100, 100, 900, 500)
    const a = { ...card(40, 80), parentId: outer.id }
    const b = { ...card(400, 80), parentId: outer.id }
    useDoc.setState({ nodes: [outer, a, b] })
    const groupId = groupNodes([a.id, b.id])!
    expect(nodeById(groupId).parentId).toBe(outer.id)
    expect(nodeById(a.id).parentId).toBe(groupId)
    expect(canvasPosition(a.id)).toEqual({ x: 140, y: 180 })
    expect(canvasPosition(b.id)).toEqual({ x: 500, y: 180 })
  })

  it('wraps a group and leaves the children of that group in it', () => {
    const box = groupNode(100, 100, 400, 300)
    const child = { ...card(40, 80), parentId: box.id }
    useDoc.setState({ nodes: [box, child] })
    const wrapper = groupNodes([box.id, child.id])!
    expect(nodeById(box.id).parentId).toBe(wrapper)
    expect(nodeById(child.id).parentId).toBe(box.id)
    expect(canvasPosition(child.id)).toEqual({ x: 140, y: 180 })
  })

  it('selects the children of the groups it removes', () => {
    const box = groupNode(0, 0, 600, 400)
    const child = { ...card(40, 60), parentId: box.id }
    useDoc.setState({ nodes: [{ ...box, selected: true }, child] })
    ungroupSelection()
    expect(nodeById(child.id).selected).toBe(true)
  })

  it('records no undo step when no group is given to ungroup', () => {
    const a = card(0, 0)
    useDoc.setState({ nodes: [a] })
    ungroupNodes([a.id, 'missing'])
    expect(useDoc.getState().nodes).toEqual([a])
    expect(canUndo()).toBe(false)
  })
})

describe('setNodeFrames', () => {
  it('moves a node out of its group and keeps its canvas place', () => {
    const box = groupNode(100, 100, 400, 300)
    const child = { ...card(40, 60), parentId: box.id }
    useDoc.setState({ nodes: [box, child] })
    setNodeFrames([{ id: child.id, parentId: null, height: 120 }])
    expect(nodeById(child.id)).toMatchObject({ parentId: undefined, position: { x: 140, y: 160 }, height: 120 })
  })

  it('skips unknown nodes and records no undo step without frames', () => {
    const a = card(0, 0)
    useDoc.setState({ nodes: [a] })
    setNodeFrames([])
    expect(canUndo()).toBe(false)
    setNodeFrames([
      { id: 'missing', x: 10 },
      { id: a.id, x: 50 },
    ])
    expect(nodeById(a.id).position).toEqual({ x: 50, y: 0 })
  })
})

describe('applyLayoutResult', () => {
  it('moves the nodes to the layout as one undo step', () => {
    const [a, b] = [card(0, 0), card(400, 0)]
    useDoc.setState({ nodes: [a, b] })
    applyLayoutResult({
      nodes: [
        { ...a, position: { x: 0, y: 300 } },
        { ...b, position: { x: 0, y: 600 } },
      ],
      edges: [],
    })
    expect(useDoc.getState().nodes.map((node) => node.position)).toEqual([
      { x: 0, y: 300 },
      { x: 0, y: 600 },
    ])
    undo()
    expect(nodeById(b.id).position).toEqual({ x: 400, y: 0 })
  })
})

describe('patch, pin and colour nodes', () => {
  it('patches several nodes in one undo step', () => {
    const [a, b] = [card(0, 0), shapeNode(400, 0)]
    useDoc.setState({ nodes: [a, b] })
    patchNodesData(
      new Map<string, NodeDataPatch>([
        [a.id, { title: 'Gateway' }],
        [b.id, { label: 'Note' }],
      ]),
    )
    expect(nodeById(a.id).data).toMatchObject({ title: 'Gateway' })
    expect(nodeById(b.id).data).toMatchObject({ label: 'Note' })
    undo()
    expect(nodeById(a.id).data).toMatchObject({ title: 'Service' })
    expect(nodeById(b.id).data).toMatchObject({ label: 'Shape' })
    expect(canUndo()).toBe(false)
  })

  it('does nothing for an empty patch and refuses an unknown field', () => {
    const box = groupNode(0, 0, 400, 300)
    useDoc.setState({ nodes: [box] })
    patchNodesData(new Map())
    expect(canUndo()).toBe(false)
    expect(() => patchNodesData(new Map([[box.id, { title: 'VPC' }]]))).toThrow('A group node has no "title" field.')
    expect(nodeById(box.id).data).toEqual(box.data)
    expect(canUndo()).toBe(false)
  })

  it('pins nodes and tells when the whole selection is pinned', () => {
    const [a, b] = [card(0, 0), card(400, 0)]
    useDoc.setState({ nodes: [a, b] })
    expect(selectionPinned()).toBe(false)
    pinNodes([a.id], true)
    selectOnly([a.id])
    expect(selectionPinned()).toBe(true)
    selectOnly([a.id, b.id])
    expect(selectionPinned()).toBe(false)
    pinNodes([a.id], false)
    expect(nodeById(a.id).data.pinned).toBe(false)
  })

  it('colours only the cards and shapes, in one undo step', () => {
    const nodes = [card(0, 0), shapeNode(300, 0), groupNode(0, 300, 400, 300), textNode(600, 0)]
    useDoc.setState({ nodes })
    colorNodes(
      nodes.map((node) => node.id),
      'teal',
    )
    expect(useDoc.getState().nodes.map((node) => ('color' in node.data ? node.data.color : null))).toEqual([
      'teal',
      'teal',
      'auto',
      null,
    ])
    undo()
    expect(nodeById(nodes[0]!.id).data).toMatchObject({ color: 'neutral' })
  })
})

describe('after a drag', () => {
  it('snaps the dropped nodes to the grid without an undo step', () => {
    const [a, b] = [card(10, 25), card(103, 7)]
    useDoc.setState({ nodes: [a, b] })
    snapAfterDrag([a.id])
    expect(nodeById(a.id).position).toEqual({ x: 16, y: 32 })
    expect(nodeById(b.id).position).toEqual({ x: 103, y: 7 })
    expect(canUndo()).toBe(false)
  })

  it('does not snap when the diagram does not snap to the grid, or the node is on the grid', () => {
    const a = card(10, 25)
    useDoc.setState({ nodes: [a], theme: { ...DEFAULT_THEME, snap: false } })
    snapAfterDrag([a.id])
    expect(nodeById(a.id).position).toEqual({ x: 10, y: 25 })

    const onGrid = card(32, 48)
    useDoc.setState({ nodes: [onGrid], theme: DEFAULT_THEME })
    const before = useDoc.getState().nodes
    snapAfterDrag([onGrid.id])
    expect(useDoc.getState().nodes).toBe(before)
  })

  it('puts a dropped node into the smallest group under its centre and keeps its canvas place', () => {
    const outer = groupNode(0, 0, 800, 600)
    const inner = groupNode(100, 100, 300, 200, outer.id)
    const dropped = card(150, 150)
    useDoc.setState({ nodes: [dropped, outer, inner] })
    reparentAfterDrag([dropped.id])
    expect(nodeById(dropped.id)).toMatchObject({ parentId: inner.id, position: { x: 50, y: 50 } })
    expect(useDoc.getState().nodes.map((node) => node.id)).toEqual([outer.id, inner.id, dropped.id])
    expect(canUndo()).toBe(false)
  })

  it('takes a node out of its group when it drops outside', () => {
    const box = groupNode(50, 50, 600, 400)
    const child = { ...card(700, 0), parentId: box.id }
    useDoc.setState({ nodes: [box, child] })
    reparentAfterDrag([child.id])
    expect(nodeById(child.id)).toMatchObject({ parentId: undefined, position: { x: 750, y: 50 } })
  })

  it('does not put a dragged group into another group', () => {
    const target = groupNode(0, 0, 800, 600)
    const dragged = groupNode(100, 100, 200, 200)
    useDoc.setState({ nodes: [target, dragged] })
    const before = useDoc.getState().nodes
    reparentAfterDrag([dragged.id])
    expect(useDoc.getState().nodes).toBe(before)
  })

  it('moves hand-drawn corners when both ends moved together', () => {
    const [a, b, c] = [card(0, 0), card(400, 0), card(800, 0)]
    const together = bentEdge(a.id, b.id, [{ x: 200, y: 200 }])
    const apart = bentEdge(b.id, c.id, [{ x: 600, y: 200 }])
    useDoc.setState({ nodes: [a, b, c], edges: [together, apart] })
    const before = useDoc.getState().nodes
    useDoc.setState({
      nodes: before.map((node) =>
        node.id === c.id ? node : { ...node, position: { x: node.position.x + 20, y: node.position.y + 10 } },
      ),
    })
    moveBendsAfterDrag(before)
    expect(edgeById(together.id).data!.bends).toEqual([{ x: 220, y: 210 }])
    expect(edgeById(apart.id).data!.bends).toEqual([{ x: 600, y: 200 }])
  })

  it('keeps the edges when no node moved', () => {
    const [a, b] = [card(0, 0), card(400, 0)]
    useDoc.setState({ nodes: [a, b], edges: [bentEdge(a.id, b.id, [{ x: 200, y: 200 }])] })
    const edges = useDoc.getState().edges
    moveBendsAfterDrag(useDoc.getState().nodes)
    expect(useDoc.getState().edges).toBe(edges)
  })
})

describe('align and distribute other ways', () => {
  it.each([
    ['right', [100, 100], [0, 300]],
    ['center', [50, 50], [0, 300]],
    ['top', [0, 100], [0, 0]],
    ['bottom', [0, 100], [300, 300]],
    ['middle', [0, 100], [150, 150]],
  ] as const)('aligns the %s sides', (alignment, xs, ys) => {
    useDoc.setState({ nodes: [card(0, 0), card(100, 300)] })
    selectOnly(useDoc.getState().nodes.map((node) => node.id))
    alignSelection(alignment)
    expect(useDoc.getState().nodes.map((node) => node.position.x)).toEqual(xs)
    expect(useDoc.getState().nodes.map((node) => node.position.y)).toEqual(ys)
  })

  it('aligns a child by its canvas position', () => {
    const box = groupNode(100, 0, 400, 300)
    const child = { ...card(0, 0), parentId: box.id }
    const other = card(0, 400)
    useDoc.setState({ nodes: [box, child, other] })
    selectOnly([child.id, other.id])
    alignSelection('left')
    expect(canvasPosition(child.id)).toEqual({ x: 0, y: 0 })
    expect(nodeById(child.id).position).toEqual({ x: -100, y: 0 })
  })

  it('makes equal gaps down the canvas', () => {
    useDoc.setState({ nodes: [card(0, 0), card(0, 100), card(0, 1000)] })
    selectOnly(useDoc.getState().nodes.map((node) => node.id))
    distributeSelection('y')
    expect(useDoc.getState().nodes.map((node) => node.position.y)).toEqual([0, 500, 1000])
  })

  it('needs two nodes to align and three to distribute', () => {
    useDoc.setState({ nodes: [card(0, 0), card(100, 300)] })
    selectOnly([useDoc.getState().nodes[0]!.id])
    alignSelection('right')
    selectOnly(useDoc.getState().nodes.map((node) => node.id))
    distributeSelection('x')
    expect(useDoc.getState().nodes.map((node) => node.position.x)).toEqual([0, 100])
    expect(canUndo()).toBe(false)
  })
})

describe('nudgeSelection', () => {
  it('moves a selected group once and its selected children with it', () => {
    const box = groupNode(0, 0, 400, 300)
    const child = { ...card(40, 60), parentId: box.id }
    useDoc.setState({ nodes: [box, child] })
    selectOnly([box.id, child.id])
    nudgeSelection(10, 0)
    expect(nodeById(box.id).position).toEqual({ x: 10, y: 0 })
    expect(nodeById(child.id).position).toEqual({ x: 40, y: 60 })
  })

  it('moves the corners of an edge whose ends both move', () => {
    const [a, b] = [card(0, 0), card(400, 0)]
    const edge = bentEdge(a.id, b.id, [{ x: 200, y: 200 }])
    useDoc.setState({ nodes: [a, b], edges: [edge] })
    selectOnly([a.id, b.id])
    nudgeSelection(0, 16)
    expect(edgeById(edge.id).data!.bends).toEqual([{ x: 200, y: 216 }])
  })

  it('makes one undo step of nudges in a row', () => {
    const a = card(0, 0)
    useDoc.setState({ nodes: [a] })
    selectOnly([a.id])
    nudgeSelection(1, 0)
    nudgeSelection(1, 0)
    nudgeSelection(0, 10)
    expect(nodeById(a.id).position).toEqual({ x: 2, y: 10 })
    undo()
    expect(nodeById(a.id).position).toEqual({ x: 0, y: 0 })
    expect(canUndo()).toBe(false)
  })

  it('does nothing without a selection', () => {
    useDoc.setState({ nodes: [card(0, 0)] })
    nudgeSelection(10, 10)
    expect(useDoc.getState().nodes[0]!.position).toEqual({ x: 0, y: 0 })
    expect(canUndo()).toBe(false)
  })
})

describe('resetEdgeRoutes', () => {
  it('removes the hand-drawn corners of the given edges', () => {
    const [a, b, c] = [card(0, 0), card(400, 0), card(800, 0)]
    const reset = bentEdge(a.id, b.id, [{ x: 200, y: 200 }])
    const kept = bentEdge(b.id, c.id, [{ x: 600, y: 200 }])
    useDoc.setState({ nodes: [a, b, c], edges: [reset, kept] })
    resetEdgeRoutes(new Set([reset.id]))
    expect(edgeById(reset.id).data).not.toHaveProperty('bends')
    expect(edgeById(kept.id).data!.bends).toHaveLength(1)
    undo()
    expect(edgeById(reset.id).data!.bends).toEqual([{ x: 200, y: 200 }])
  })

  it('records no undo step for edges without corners', () => {
    const [a, b] = [card(0, 0), card(400, 0)]
    const edge = createEdge(a.id, b.id)
    useDoc.setState({ nodes: [a, b], edges: [edge] })
    resetEdgeRoutes(new Set([edge.id]))
    expect(canUndo()).toBe(false)
  })
})

describe('arrangeSelection', () => {
  it('brings selected elements to the front and keeps groups behind all elements', () => {
    const [a, b] = [card(0, 0), card(100, 0)]
    const box = groupNode(0, 0, 400, 300)
    const edge = createEdge(a.id, b.id)
    useDoc.setState({ nodes: [box, a, b], edges: [edge] })
    selectOnly([a.id, box.id], [edge.id])
    arrangeSelection('front')
    expect(nodeById(a.id).zIndex).toBe(ELEMENT_Z + 1)
    expect(nodeById(b.id).zIndex).toBe(ELEMENT_Z)
    expect(nodeById(box.id).zIndex).toBe(-1)
    expect(edgeById(edge.id).zIndex).toBe(1)
  })

  it('sends selected elements to the back, above the groups', () => {
    const [a, b] = [card(0, 0), card(100, 0)]
    const [box, otherBox] = [groupNode(0, 0, 400, 300), groupNode(500, 0, 400, 300)]
    const edge = createEdge(a.id, b.id)
    useDoc.setState({ nodes: [box, otherBox, a, b], edges: [edge] })
    selectOnly([b.id, otherBox.id], [edge.id])
    arrangeSelection('back')
    expect(nodeById(b.id).zIndex).toBe(ELEMENT_Z - 1)
    expect(nodeById(otherBox.id).zIndex).toBe(-2)
    expect(edgeById(edge.id).zIndex).toBe(-1)
    undo()
    expect(nodeById(b.id).zIndex).toBe(ELEMENT_Z)
  })

  it('does nothing without a selection', () => {
    useDoc.setState({ nodes: [card(0, 0)] })
    arrangeSelection('front')
    expect(canUndo()).toBe(false)
  })
})

describe('flows', () => {
  function nodeStep(id: string): Step {
    return {
      id: newId('s'),
      target: { kind: 'node', id },
      caption: '',
      event: '',
      latencyMs: null,
      level: 'info',
      durationMs: 1000,
      camera: 'follow',
      zoom: 1,
    }
  }

  it('adds flows with numbered names and removes them', () => {
    const first = addFlow()
    const second = addFlow('Checkout')
    expect(useDoc.getState().flows.map((flow) => flow.name)).toEqual(['Flow 1', 'Checkout'])
    deleteFlow(first.id)
    expect(useDoc.getState().flows.map((flow) => flow.id)).toEqual([second.id])
    undo()
    expect(useDoc.getState().flows).toHaveLength(2)
  })

  it('changes a flow with a recipe as an undo step', () => {
    const flow = addFlow('Checkout')
    const a = card(0, 0)
    updateFlow(flow.id, (draft) => {
      draft.loop = true
      draft.steps.push(nodeStep(a.id))
    })
    expect(useDoc.getState().flows[0]).toMatchObject({ loop: true, steps: [{ target: { id: a.id } }] })
    undo()
    expect(useDoc.getState().flows[0]).toMatchObject({ loop: false, steps: [] })
  })

  it('merges flow edits with the same key into one undo step', () => {
    const flow = addFlow('Checkout')
    updateFlow(
      flow.id,
      (draft) => {
        draft.name = 'Ch'
      },
      'flow-name',
    )
    updateFlow(
      flow.id,
      (draft) => {
        draft.name = 'Check'
      },
      'flow-name',
    )
    expect(useDoc.getState().flows[0]!.name).toBe('Check')
    undo()
    expect(useDoc.getState().flows[0]!.name).toBe('Checkout')
  })

  it('duplicates a flow with a new id and its own steps', () => {
    const flow = addFlow('Checkout')
    updateFlow(flow.id, (draft) => {
      draft.steps.push(nodeStep('n_a'))
    })
    const copy = duplicateFlow(flow.id)!
    expect(copy).toMatchObject({ name: 'Checkout copy', steps: [{ target: { id: 'n_a' } }] })
    expect(copy.id).not.toBe(flow.id)
    updateFlow(copy.id, (draft) => {
      draft.steps[0]!.caption = 'Changed'
    })
    expect(useDoc.getState().flows[0]!.steps[0]!.caption).toBe('')
    expect(useDoc.getState().flows[1]!.steps[0]!.caption).toBe('Changed')
  })

  it('duplicates no flow for an unknown id', () => {
    expect(duplicateFlow('missing')).toBeNull()
    expect(canUndo()).toBe(false)
  })
})
