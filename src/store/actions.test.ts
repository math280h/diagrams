import { beforeEach, describe, expect, it } from 'vitest'
import { createEdge, defaultGroupData, newId } from '@/model/defaults'
import { absolutePosition } from '@/model/graph'
import { PRESET_BY_ID } from '@/model/presets'
import type { DiagramNode } from '@/model/types'
import {
  alignSelection,
  deleteElements,
  distributeSelection,
  groupNodes,
  groupSelection,
  selectOnly,
  fitGroupsToChildren,
  setNodeFrames,
  ungroupNodes,
  ungroupSelection,
} from './actions'
import { useDoc } from './doc-store'
import { resetHistory } from './history'

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

beforeEach(() => {
  useDoc.setState({ nodes: [], edges: [], flows: [] })
  resetHistory()
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
})
