import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import { produce, type Draft } from 'immer'
import type { Color } from '@/model/colors'
import { createEdge, createFlow, defaultGroupData, newId } from '@/model/defaults'
import {
  absolutePosition,
  absoluteRect,
  descendantIds,
  ELEMENT_Z,
  estimateSize,
  groupRectAround,
  nodeSize,
  relativePosition,
  snapToGrid,
  sortParentsFirst,
} from '@/model/graph'
import {
  cardDataSchema,
  groupDataSchema,
  shapeDataSchema,
  textDataSchema,
  type CardData,
  type Diagram,
  type DiagramTheme,
  type EdgeData,
  type Flow,
  type GroupData,
  type PayloadField,
  type ShapeData,
  type TextData,
} from '@/model/schema'
import { withPayload, type PayloadPart } from '@/model/payload'
import { takesColor, type DiagramEdge, type DiagramNode } from '@/model/types'
import { applyLayout } from '@/layout/apply-layout'
import { followBends } from '@/model/bends'
import type { LayoutResult } from '@/layout/diagram-layout'
import { unionRects, type Rect } from '@/model/rect'
import { fromDiagram } from '@/persistence/serialize'
import { useDoc, type DocState } from './doc-store'
import { record } from './history'

export type NodeDataPatch = Partial<CardData> | Partial<ShapeData> | Partial<TextData> | Partial<GroupData>

const DATA_FIELDS: Record<DiagramNode['type'], ReadonlySet<string>> = {
  card: new Set(Object.keys(cardDataSchema.shape)),
  shape: new Set(Object.keys(shapeDataSchema.shape)),
  text: new Set(Object.keys(textDataSchema.shape)),
  group: new Set(Object.keys(groupDataSchema.shape)),
}

/**
 * Returns the node with the patch merged into its data.
 *
 * @throws Error If the patch has a field that the data of this node type does not have.
 */
function withData(node: DiagramNode, patch: NodeDataPatch): DiagramNode {
  const unknown = Object.keys(patch).find((field) => !DATA_FIELDS[node.type].has(field))
  if (unknown !== undefined) throw new Error(`A ${node.type} node has no "${unknown}" field.`)
  return { ...node, data: { ...node.data, ...patch } } as DiagramNode
}

function update(recipe: (draft: Draft<DocState>) => void) {
  useDoc.setState(produce(useDoc.getState(), recipe))
}

export function onNodesChange(changes: NodeChange<DiagramNode>[]) {
  if (changes.some((change) => change.type === 'remove')) record('remove')
  else if (changes.some((change) => change.type === 'position' && !change.dragging)) record('nudge')
  useDoc.setState({ nodes: applyNodeChanges(changes, useDoc.getState().nodes) })
}

export function onEdgesChange(changes: EdgeChange<DiagramEdge>[]) {
  if (changes.some((change) => change.type === 'remove')) record('remove')
  useDoc.setState({ edges: applyEdgeChanges(changes, useDoc.getState().edges) })
}

export function onConnect(connection: Connection) {
  if (connection.source === connection.target) return
  record()
  const edge = createEdge(connection.source, connection.target, {}, connection)
  useDoc.setState({ edges: addEdge(edge, useDoc.getState().edges) })
}

export function addNodes(nodes: DiagramNode[], edges: DiagramEdge[] = [], select = true) {
  record()
  const state = useDoc.getState()
  const deselectedNodes = select
    ? state.nodes.map((node) => (node.selected ? { ...node, selected: false } : node))
    : state.nodes
  const deselectedEdges = select
    ? state.edges.map((edge) => (edge.selected ? { ...edge, selected: false } : edge))
    : state.edges
  useDoc.setState({
    nodes: sortParentsFirst([...deselectedNodes, ...nodes.map((node) => ({ ...node, selected: select }))]),
    edges: [...deselectedEdges, ...edges],
  })
}

/**
 * Merges the patch into the data of a node.
 *
 * @param key - The undo key. Edits with the same key less than {@link COALESCE_MS} apart make one undo step.
 * @throws Error If the patch has a field that the data of this node type does not have.
 */
export function updateNodeData(id: string, patch: NodeDataPatch, key = `node-data:${id}`) {
  record(key)
  useDoc.setState({
    nodes: useDoc.getState().nodes.map((node) => (node.id === id ? withData(node, patch) : node)),
  })
}

export function updateEdgeData(id: string, patch: Partial<EdgeData>, key = `edge-data:${id}`) {
  updateEdgesData(new Set([id]), patch, key)
}

export function updateEdgesData(ids: ReadonlySet<string>, patch: Partial<EdgeData>, key = 'edges-data') {
  record(key)
  useDoc.setState({
    edges: useDoc
      .getState()
      .edges.map((edge) => (ids.has(edge.id) && edge.data ? { ...edge, data: { ...edge.data, ...patch } } : edge)),
  })
}

/**
 * Replaces the fields of the request or the response body of an edge. No fields remove that body.
 *
 * @param key - The undo key. Edits with the same key less than {@link COALESCE_MS} apart make one undo step.
 */
export function setEdgePayload(id: string, part: PayloadPart, fields: PayloadField[], key?: string) {
  record(key)
  useDoc.setState({
    edges: useDoc
      .getState()
      .edges.map((edge) =>
        edge.id === id && edge.data ? { ...edge, data: withPayload(edge.data, part, fields) } : edge,
      ),
  })
}

export function setEdgeSides(id: string, sourceHandle: string | null, targetHandle: string | null) {
  record()
  useDoc.setState({
    edges: useDoc.getState().edges.map((edge) => (edge.id === id ? { ...edge, sourceHandle, targetHandle } : edge)),
  })
}

export function reverseEdge(id: string) {
  record()
  useDoc.setState({
    edges: useDoc.getState().edges.map((edge) =>
      edge.id === id
        ? {
            ...edge,
            source: edge.target,
            target: edge.source,
            sourceHandle: edge.targetHandle,
            targetHandle: edge.sourceHandle,
          }
        : edge,
    ),
  })
}

export function setName(name: string) {
  record('name')
  useDoc.setState({ name })
}

export function setTheme(patch: Partial<DiagramTheme>) {
  record('theme')
  useDoc.setState({ theme: { ...useDoc.getState().theme, ...patch } })
}

/** Sets the viewport that the next save writes. It records no undo step. */
export function setViewport(viewport: Diagram['viewport']) {
  useDoc.setState({ viewport })
}

/** Replaces the name, theme, nodes, edges and flows with those of an older version, as one undo step. */
export function restoreContent(version: Diagram) {
  record()
  const { nodes, edges } = fromDiagram(version)
  useDoc.setState({ name: version.name, theme: version.theme, nodes, edges, flows: version.flows })
}

export function selectedIds() {
  const { nodes, edges } = useDoc.getState()
  return {
    nodes: new Set(nodes.filter((node) => node.selected).map((node) => node.id)),
    edges: new Set(edges.filter((edge) => edge.selected).map((edge) => edge.id)),
  }
}

export function selectAll() {
  const { nodes, edges } = useDoc.getState()
  useDoc.setState({
    nodes: nodes.map((node) => (node.selected ? node : { ...node, selected: true })),
    edges: edges.map((edge) => (edge.selected ? edge : { ...edge, selected: true })),
  })
}

export function selectOnly(nodeIds: Iterable<string>, edgeIds: Iterable<string> = []) {
  const nodeSet = new Set(nodeIds)
  const edgeSet = new Set(edgeIds)
  const { nodes, edges } = useDoc.getState()
  useDoc.setState({
    nodes: nodes.map((node) =>
      node.selected === nodeSet.has(node.id) ? node : { ...node, selected: nodeSet.has(node.id) },
    ),
    edges: edges.map((edge) =>
      edge.selected === edgeSet.has(edge.id) ? edge : { ...edge, selected: edgeSet.has(edge.id) },
    ),
  })
}

/** Removes nodes with their descendants, edges, and the edges that touch a removed node. */
export function deleteElements(nodeIds: Iterable<string>, edgeIds: Iterable<string> = []) {
  const { nodes, edges } = useDoc.getState()
  const removed = descendantIds(nodeIds, nodes)
  const removedEdges = new Set(edgeIds)
  if (removed.size === 0 && removedEdges.size === 0) return
  record()
  useDoc.setState({
    nodes: nodes.filter((node) => !removed.has(node.id)),
    edges: edges.filter((edge) => !removedEdges.has(edge.id) && !removed.has(edge.source) && !removed.has(edge.target)),
  })
}

export function deleteSelection() {
  const selected = selectedIds()
  deleteElements(selected.nodes, selected.edges)
}

/**
 * Copies nodes and the edges between them with new ids.
 *
 * @param offsetPx - The distance on the canvas from the original position of top-level nodes.
 */
export function cloneSubgraph(
  sourceNodes: DiagramNode[],
  sourceEdges: DiagramEdge[],
  offsetPx: { x: number; y: number },
): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  const ids = new Map(sourceNodes.map((node) => [node.id, newId('n')]))
  const nodes = sourceNodes.map((node) => {
    const parentId = node.parentId && ids.has(node.parentId) ? ids.get(node.parentId) : undefined
    const keepsParent = parentId !== undefined
    return {
      ...structuredClone(node),
      id: ids.get(node.id)!,
      parentId: keepsParent ? parentId : node.parentId,
      position: keepsParent ? node.position : { x: node.position.x + offsetPx.x, y: node.position.y + offsetPx.y },
      selected: true,
      dragging: false,
    }
  })
  const edges = sourceEdges
    .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
    .map((edge) => ({
      ...structuredClone(edge),
      id: newId('e'),
      source: ids.get(edge.source)!,
      target: ids.get(edge.target)!,
      selected: false,
    }))
  return { nodes, edges }
}

export function selectionSubgraph() {
  const { nodes, edges } = useDoc.getState()
  const selected = selectedIds()
  const included = descendantIds(selected.nodes, nodes)
  return {
    nodes: nodes.filter((node) => included.has(node.id)),
    edges: edges.filter((edge) => included.has(edge.source) && included.has(edge.target)),
  }
}

/**
 * Returns {@link selectionSubgraph} as a diagram of its own: a node whose parent is not part of it takes its absolute
 * position and no parent.
 */
export function detachedSelection(): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  const { nodes, edges } = selectionSubgraph()
  const all = new Map(useDoc.getState().nodes.map((node) => [node.id, node]))
  const included = new Set(nodes.map((node) => node.id))
  return {
    nodes: nodes.map((node) =>
      node.parentId && !included.has(node.parentId)
        ? { ...node, parentId: undefined, position: absolutePosition(node, all) }
        : node,
    ),
    edges,
  }
}

export function duplicateSelection() {
  const subgraph = selectionSubgraph()
  if (subgraph.nodes.length === 0) return
  const copy = cloneSubgraph(subgraph.nodes, subgraph.edges, { x: 32, y: 32 })
  addNodes(copy.nodes, copy.edges)
}

/**
 * Puts nodes into a new group that fits around them.
 *
 * @param data - The data of the new group, for example a boundary kind.
 * @param select - If true, the new group becomes the only selected node.
 * @returns The id of the new group, or `null` if `ids` is empty or the nodes have different parents.
 */
export function groupNodes(ids: Iterable<string>, data: Partial<GroupData> = {}, select = false): string | null {
  const { nodes } = useDoc.getState()
  const idSet = new Set(ids)
  const selected = nodes.filter((node) => idSet.has(node.id) && !(node.parentId && idSet.has(node.parentId)))
  if (selected.length === 0) return null
  const parentId = selected[0]!.parentId
  if (!selected.every((node) => node.parentId === parentId)) return null
  const byId = new Map(nodes.map((node) => [node.id, node]))

  const frame = groupRectAround(unionRects(selected.map((node) => absoluteRect(node, byId)))!)
  const parentOrigin = parentId && byId.get(parentId) ? absolutePosition(byId.get(parentId)!, byId) : { x: 0, y: 0 }

  record()
  const group: DiagramNode = {
    id: newId('n'),
    type: 'group',
    position: { x: frame.x - parentOrigin.x, y: frame.y - parentOrigin.y },
    width: frame.width,
    height: frame.height,
    zIndex: -1,
    parentId,
    selected: select,
    data: defaultGroupData(data),
  }
  const selectedIdSet = new Set(selected.map((node) => node.id))
  const next = nodes.map((node) => {
    if (!selectedIdSet.has(node.id)) return select && node.selected ? { ...node, selected: false } : node
    const absolute = absolutePosition(node, byId)
    return {
      ...node,
      parentId: group.id,
      selected: select ? false : node.selected,
      position: { x: absolute.x - frame.x, y: absolute.y - frame.y },
    }
  })
  useDoc.setState({ nodes: sortParentsFirst([group, ...next]) })
  return group.id
}

/**
 * Puts the selected nodes into a new group that fits around them.
 *
 * @param data - The data of the new group, for example a boundary kind.
 * @returns True if the function made a group. It makes no group without a selection, or if the
 *     selected nodes have different parents.
 */
export function groupSelection(data: Partial<GroupData> = {}): boolean {
  const ids = useDoc
    .getState()
    .nodes.filter((node) => node.selected)
    .map((node) => node.id)
  return groupNodes(ids, data, true) !== null
}

/**
 * Removes groups and keeps their children where they are on the canvas.
 *
 * A child moves to the nearest group above it that stays, or to the top level. Edges that end at a removed group go
 * too.
 *
 * @param select - If true, the children that were in the groups become selected.
 */
export function ungroupNodes(ids: Iterable<string>, select = false) {
  const { nodes, edges } = useDoc.getState()
  const wanted = new Set(ids)
  const groups = nodes.filter((node) => wanted.has(node.id) && node.type === 'group')
  if (groups.length === 0) return
  record()
  const groupIds = new Set(groups.map((group) => group.id))
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const keptParent = (id: string | undefined) => {
    let parentId = id
    while (parentId && groupIds.has(parentId)) parentId = byId.get(parentId)?.parentId
    return parentId
  }
  const next = nodes
    .filter((node) => !groupIds.has(node.id))
    .map((node) => {
      if (!node.parentId || !groupIds.has(node.parentId)) return node
      const parentId = keptParent(node.parentId)
      const parent = parentId ? byId.get(parentId) : undefined
      return {
        ...node,
        parentId: parent?.id,
        selected: select ? true : node.selected,
        position: relativePosition(absolutePosition(node, byId), parent && absolutePosition(parent, byId)),
      }
    })
  useDoc.setState({
    nodes: sortParentsFirst(next),
    edges: edges.filter((edge) => !groupIds.has(edge.source) && !groupIds.has(edge.target)),
  })
}

export function ungroupSelection() {
  const groups = useDoc.getState().nodes.filter((node) => node.selected && node.type === 'group')
  ungroupNodes(
    groups.map((group) => group.id),
    true,
  )
}

export interface NodeFrame {
  id: string
  /** The left edge in canvas coordinates. */
  x?: number
  /** The top edge in canvas coordinates. */
  y?: number
  width?: number
  height?: number
  /** The new parent group. The value `null` moves the node to the top level. */
  parentId?: string | null
}

/**
 * Moves, resizes and reparents nodes. A node keeps its place on the canvas when only its parent changes.
 *
 * The function skips a frame that would put a node inside itself or inside one of its descendants.
 */
export function setNodeFrames(frames: NodeFrame[]) {
  if (frames.length === 0) return
  record()
  const byId = new Map(useDoc.getState().nodes.map((node) => [node.id, node]))
  for (const frame of frames) {
    const node = byId.get(frame.id)
    if (!node) continue
    const parentId = frame.parentId === undefined ? node.parentId : (frame.parentId ?? undefined)
    if (parentId !== node.parentId && parentId && descendantIds([node.id], [...byId.values()]).has(parentId)) continue
    const parent = parentId ? byId.get(parentId) : undefined
    const absolute = absolutePosition(node, byId)
    const moved: DiagramNode = {
      ...node,
      parentId: parent?.id,
      position: relativePosition(
        { x: frame.x ?? absolute.x, y: frame.y ?? absolute.y },
        parent && absolutePosition(parent, byId),
      ),
    }
    if (frame.width !== undefined) moved.width = frame.width
    if (frame.height !== undefined) moved.height = frame.height
    byId.set(node.id, moved)
  }
  useDoc.setState({ nodes: sortParentsFirst([...byId.values()]) })
}

/**
 * Grows groups, and the groups around them, until they hold their children with the group padding.
 *
 * Every node keeps its place on the canvas.
 */
export function fitGroupsToChildren(groupIds: Iterable<string>) {
  const nodes = useDoc.getState().nodes
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const absolute = new Map(nodes.map((node) => [node.id, absolutePosition(node, byId)]))
  const frames = new Map<string, Rect>()
  const rectOf = (node: DiagramNode) => frames.get(node.id) ?? { ...absolute.get(node.id)!, ...estimateSize(node) }
  for (const id of groupIds) {
    let group = byId.get(id)
    while (group?.type === 'group') {
      const groupId = group.id
      const inner = unionRects(nodes.filter((node) => node.parentId === groupId).map(rectOf))
      const current = rectOf(group)
      const next = inner ? unionRects([current, groupRectAround(inner)])! : current
      if (
        next.x === current.x &&
        next.y === current.y &&
        next.width === current.width &&
        next.height === current.height
      ) {
        break
      }
      frames.set(groupId, next)
      group = group.parentId ? byId.get(group.parentId) : undefined
    }
  }
  if (frames.size === 0) return
  record()
  for (const [id, frame] of frames) absolute.set(id, { x: frame.x, y: frame.y })
  useDoc.setState({
    nodes: nodes.map((node) => {
      const at = absolute.get(node.id)!
      const position = relativePosition(at, node.parentId ? absolute.get(node.parentId) : undefined)
      const frame = frames.get(node.id)
      if (!frame && position.x === node.position.x && position.y === node.position.y) return node
      return frame ? { ...node, position, width: frame.width, height: frame.height } : { ...node, position }
    }),
  })
}

/** Applies a layout that ran on an earlier copy of the diagram, as one undo step. See {@link applyLayout}. */
export function applyLayoutResult(result: LayoutResult) {
  record()
  const { nodes, edges } = useDoc.getState()
  useDoc.setState(applyLayout(nodes, edges, result))
}

export interface EdgeUpdate {
  id: string
  source: string
  target: string
  data: Partial<EdgeData>
  /** The sides that the ends attach to: `auto` lets the canvas choose them, `null` keeps them. */
  sides: { sourceHandle: string; targetHandle: string } | 'auto' | null
}

/** Changes the ends, sides and data of edges. */
export function updateEdges(updates: readonly EdgeUpdate[]) {
  if (updates.length === 0) return
  record()
  const byId = new Map(updates.map((change) => [change.id, change]))
  useDoc.setState({
    edges: useDoc.getState().edges.map((edge): DiagramEdge => {
      const change = byId.get(edge.id)
      if (!change || !edge.data) return edge
      const ends =
        change.sides === 'auto'
          ? { sourceHandle: null, targetHandle: null, sides: 'auto' as const }
          : change.sides
            ? { ...change.sides, sides: 'fixed' as const }
            : null
      return {
        ...edge,
        source: change.source,
        target: change.target,
        ...(ends && { sourceHandle: ends.sourceHandle, targetHandle: ends.targetHandle }),
        data: { ...edge.data, ...change.data, ...(ends && { sides: ends.sides }) },
      }
    }),
  })
}

/**
 * Merges a data patch into each node, as one undo step.
 *
 * @throws Error If a patch has a field that the data of its node type does not have.
 */
export function patchNodesData(patches: ReadonlyMap<string, NodeDataPatch>) {
  if (patches.size === 0) return
  record()
  useDoc.setState({
    nodes: useDoc.getState().nodes.map((node) => {
      const patch = patches.get(node.id)
      return patch ? withData(node, patch) : node
    }),
  })
}

/** Pins or unpins the nodes, as one undo step. A layout keeps a pinned node in its place. */
export function pinNodes(ids: Iterable<string>, pinned: boolean) {
  patchNodesData(new Map([...ids].map((id) => [id, { pinned }])))
}

/** Returns true if the selection has nodes and all of them are pinned. */
export function selectionPinned(): boolean {
  const selected = useDoc.getState().nodes.filter((node) => node.selected)
  return selected.length > 0 && selected.every((node) => node.data.pinned === true)
}

/** Gives a colour to the cards and shapes among the nodes, as one undo step. Other node types do not change. */
export function colorNodes(ids: Iterable<string>, color: Color) {
  const wanted = new Set(ids)
  const colored = useDoc.getState().nodes.filter((node) => wanted.has(node.id) && takesColor(node))
  patchNodesData(new Map(colored.map((node) => [node.id, { color }])))
}

/**
 * Moves dropped nodes to the nearest grid point if the diagram snaps to the grid.
 *
 * Call it after a drag. The function does not record an undo step.
 */
export function snapAfterDrag(draggedIds: string[]) {
  const { nodes, theme } = useDoc.getState()
  if (!theme.snap) return
  const ids = new Set(draggedIds)
  let changed = false
  const next = nodes.map((node) => {
    if (!ids.has(node.id)) return node
    const position = { x: snapToGrid(node.position.x), y: snapToGrid(node.position.y) }
    if (position.x === node.position.x && position.y === node.position.y) return node
    changed = true
    return { ...node, position }
  })
  if (changed) useDoc.setState({ nodes: next })
}

/**
 * Puts a dropped node into the group under its center, or takes it out of its group.
 *
 * Call it after a drag. The function does not record an undo step.
 */
export function reparentAfterDrag(draggedIds: string[]) {
  const { nodes } = useDoc.getState()
  const byId = new Map(nodes.map((node) => [node.id, node]))
  let changed = false
  const next = nodes.map((node) => {
    if (!draggedIds.includes(node.id) || node.type === 'group') return node
    const rect = absoluteRect(node, byId)
    const centerX = rect.x + rect.width / 2
    const centerY = rect.y + rect.height / 2
    let target: DiagramNode | undefined
    for (const candidate of nodes) {
      if (candidate.type !== 'group' || candidate.id === node.id) continue
      const groupRect = absoluteRect(candidate, byId)
      const inside =
        centerX >= groupRect.x &&
        centerX <= groupRect.x + groupRect.width &&
        centerY >= groupRect.y &&
        centerY <= groupRect.y + groupRect.height
      if (
        inside &&
        (!target || groupRect.width * groupRect.height < nodeSize(target).width * nodeSize(target).height)
      ) {
        target = candidate
      }
    }
    const nextParent = target?.id
    if (nextParent === node.parentId) return node
    changed = true
    return { ...node, parentId: nextParent, position: relativePosition(rect, target && absolutePosition(target, byId)) }
  })
  if (changed) useDoc.setState({ nodes: sortParentsFirst(next) })
}

export type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

export function alignSelection(alignment: Alignment) {
  const { nodes } = useDoc.getState()
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const selected = nodes.filter((node) => node.selected)
  if (selected.length < 2) return
  const rects = new Map(selected.map((node) => [node.id, absoluteRect(node, byId)]))
  const all = [...rects.values()]
  const minX = Math.min(...all.map((rect) => rect.x))
  const maxX = Math.max(...all.map((rect) => rect.x + rect.width))
  const minY = Math.min(...all.map((rect) => rect.y))
  const maxY = Math.max(...all.map((rect) => rect.y + rect.height))
  record()
  useDoc.setState({
    nodes: nodes.map((node) => {
      const rect = rects.get(node.id)
      if (!rect) return node
      let dx = 0
      let dy = 0
      if (alignment === 'left') dx = minX - rect.x
      if (alignment === 'right') dx = maxX - (rect.x + rect.width)
      if (alignment === 'center') dx = (minX + maxX) / 2 - (rect.x + rect.width / 2)
      if (alignment === 'top') dy = minY - rect.y
      if (alignment === 'bottom') dy = maxY - (rect.y + rect.height)
      if (alignment === 'middle') dy = (minY + maxY) / 2 - (rect.y + rect.height / 2)
      return { ...node, position: { x: node.position.x + dx, y: node.position.y + dy } }
    }),
  })
}

export function distributeSelection(axis: 'x' | 'y') {
  const { nodes } = useDoc.getState()
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const selected = nodes.filter((node) => node.selected)
  if (selected.length < 3) return
  const entries = selected
    .map((node) => ({ node, rect: absoluteRect(node, byId) }))
    .toSorted((a, b) => (axis === 'x' ? a.rect.x - b.rect.x : a.rect.y - b.rect.y))
  const size = (rect: { width: number; height: number }) => (axis === 'x' ? rect.width : rect.height)
  const start = (rect: { x: number; y: number }) => (axis === 'x' ? rect.x : rect.y)
  const first = entries[0]!.rect
  const last = entries[entries.length - 1]!.rect
  const span = start(last) + size(last) - start(first)
  const gap = (span - entries.reduce((sum, entry) => sum + size(entry.rect), 0)) / (entries.length - 1)
  const moves = new Map<string, number>()
  let cursor = start(first)
  for (const entry of entries) {
    moves.set(entry.node.id, cursor - start(entry.rect))
    cursor += size(entry.rect) + gap
  }
  record()
  useDoc.setState({
    nodes: nodes.map((node) => {
      const delta = moves.get(node.id)
      if (!delta) return node
      return {
        ...node,
        position:
          axis === 'x'
            ? { x: node.position.x + delta, y: node.position.y }
            : { x: node.position.x, y: node.position.y + delta },
      }
    }),
  })
}

export function nudgeSelection(dx: number, dy: number) {
  const { nodes, edges } = useDoc.getState()
  if (!nodes.some((node) => node.selected)) return
  record('nudge')
  const next = nodes.map((node) =>
    node.selected && !(node.parentId && nodes.find((parent) => parent.id === node.parentId)?.selected)
      ? { ...node, position: { x: node.position.x + dx, y: node.position.y + dy } }
      : node,
  )
  useDoc.setState({ nodes: next, edges: followBends(edges, nodes, next) })
}

/**
 * Moves the corners of the routes drawn by hand whose two ends moved together since `before`, as {@link followBends}
 * describes. Call it after a drag. The function does not record an undo step.
 */
export function moveBendsAfterDrag(before: readonly DiagramNode[]) {
  const { nodes, edges } = useDoc.getState()
  const next = followBends(edges, before, nodes)
  if (next !== edges) useDoc.setState({ edges: next })
}

/** Removes the corners drawn by hand from edges, so that the canvas routes them around the nodes again. */
export function resetEdgeRoutes(ids: ReadonlySet<string>) {
  const { edges } = useDoc.getState()
  if (!edges.some((edge) => ids.has(edge.id) && edge.data?.bends)) return
  record()
  useDoc.setState({
    edges: edges.map((edge) => {
      if (!ids.has(edge.id) || !edge.data?.bends) return edge
      const { bends: _bends, ...data } = edge.data
      return { ...edge, data }
    }),
  })
}

export function arrangeSelection(direction: 'front' | 'back') {
  const { nodes, edges } = useDoc.getState()
  const anyNode = nodes.some((node) => node.selected)
  const anyEdge = edges.some((edge) => edge.selected)
  if (!anyNode && !anyEdge) return
  record()
  const groupValues = nodes.filter((node) => node.type === 'group').map((node) => node.zIndex ?? -1)
  const elementValues = nodes.filter((node) => node.type !== 'group').map((node) => node.zIndex ?? ELEMENT_Z)
  const edgeValues = edges.map((edge) => edge.zIndex ?? 0)
  const front = direction === 'front'
  const groupTarget = front ? Math.min(-1, Math.max(-1, ...groupValues) + 1) : Math.min(-1, ...groupValues) - 1
  const elementTarget = front
    ? Math.max(ELEMENT_Z, ...elementValues) + 1
    : Math.max(ELEMENT_Z / 2, Math.min(ELEMENT_Z, ...elementValues) - 1)
  const edgeTarget = front ? Math.max(0, ...edgeValues) + 1 : Math.min(0, ...edgeValues) - 1
  useDoc.setState({
    nodes: nodes.map((node) =>
      node.selected ? { ...node, zIndex: node.type === 'group' ? groupTarget : elementTarget } : node,
    ),
    edges: edges.map((edge) => (edge.selected ? { ...edge, zIndex: edgeTarget } : edge)),
  })
}

export function addFlow(name?: string): Flow {
  record()
  const flow = createFlow(name ?? `Flow ${useDoc.getState().flows.length + 1}`)
  useDoc.setState({ flows: [...useDoc.getState().flows, flow] })
  return flow
}

/**
 * Changes one flow with an immer recipe.
 *
 * @param key - The undo key. Edits with the same key less than {@link COALESCE_MS} apart make one undo step.
 */
export function updateFlow(id: string, recipe: (flow: Draft<Flow>) => void, key?: string) {
  record(key)
  update((draft) => {
    const flow = draft.flows.find((candidate) => candidate.id === id)
    if (flow) recipe(flow)
  })
}

export function deleteFlow(id: string) {
  record()
  useDoc.setState({ flows: useDoc.getState().flows.filter((flow) => flow.id !== id) })
}

export function duplicateFlow(id: string): Flow | null {
  const flow = useDoc.getState().flows.find((candidate) => candidate.id === id)
  if (!flow) return null
  record()
  const copy: Flow = { ...structuredClone(flow), id: newId('f'), name: `${flow.name} copy` }
  useDoc.setState({ flows: [...useDoc.getState().flows, copy] })
  return copy
}

export function updateEdgesTraffic(
  ids: ReadonlySet<string>,
  patch: Partial<EdgeData['traffic']>,
  key = 'edges-traffic',
) {
  record(key)
  useDoc.setState({
    edges: useDoc
      .getState()
      .edges.map((edge) =>
        ids.has(edge.id) && edge.data
          ? { ...edge, data: { ...edge.data, traffic: { ...edge.data.traffic, ...patch } } }
          : edge,
      ),
  })
}
