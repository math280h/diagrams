import type { LayoutDirection, LayoutResult } from '@/layout/diagram-layout'
import { boundaryKind } from '@/model/boundaries'
import {
  absolutePosition,
  estimateSize,
  GROUP_PADDING_PX,
  groupRectAround,
  nodeSize,
  relativePosition,
  snapToGrid,
  sortParentsFirst,
} from '@/model/graph'
import { BOUNDARY_SIZE } from '@/model/presets'
import { rectsOverlap, unionRects, type Rect } from '@/model/rect'
import type { XY } from '@/model/schema'
import type { DiagramEdge, DiagramNode, GroupNodeType } from '@/model/types'

export type LayoutFunction = (
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  direction: LayoutDirection,
) => Promise<LayoutResult>

type Point = { x: number; y: number }

/** The space between a new block of nodes and the current content, in canvas pixels. */
const BLOCK_GAP_PX = 160
/** The space between a new node and the node in the diagram that it connects to, in canvas pixels. */
const NEIGHBOR_GAP_PX = 120
/** The space between nodes that the placement puts in a row inside a group, in canvas pixels. */
const ROW_GAP_PX = 40
/** The distance that a new node moves down when it overlaps another node, in canvas pixels. */
const SLIDE_STEP_PX = 32
const MAX_SLIDES = 200
/** The smallest size of a new group around the new nodes in it, in canvas pixels. */
const MIN_GROUP_SIZE_PX = { width: 320, height: 200 }

/** Returns the default size of a new group with no nodes in it, from its boundary kind. */
function emptyGroupSize(node: GroupNodeType) {
  return BOUNDARY_SIZE[boundaryKind(node.data.kind).tier]
}

export interface PlacementInput {
  existing: DiagramNode[]
  /** New nodes. A node in `fixed` has an absolute position. The position of other new nodes does not matter. */
  added: DiagramNode[]
  fixed: ReadonlySet<string>
  /** All edges, old and new. */
  edges: DiagramEdge[]
  direction: LayoutDirection
  layout: LayoutFunction
}

export interface PlacementResult {
  /** The new nodes with positions relative to their parents, parents first. */
  added: DiagramNode[]
  /** The groups of the diagram that got new nodes. They grow around them when the change commits. */
  containers: string[]
  /** The routes of edges inside a block of new nodes, in canvas coordinates. */
  routes: Map<string, XY[]>
}

/**
 * Gives positions to new nodes that have none.
 *
 * The function places the new nodes block by block. A top-level block goes next to the diagram node that it connects to.
 * Without such a node, it goes to the right of the current content. A block inside a group goes in a new row at the
 * bottom of the group.
 */
export async function placeNodes(input: PlacementInput): Promise<PlacementResult> {
  const existingById = new Map(input.existing.map((node) => [node.id, node]))
  const addedById = new Map(input.added.map((node) => [node.id, node]))
  const floating = new Set(input.added.filter((node) => !input.fixed.has(node.id)).map((node) => node.id))
  const absolute = new Map<string, Point>()
  const sizes = new Map<string, { width: number; height: number }>()

  for (const node of input.existing) {
    absolute.set(node.id, absolutePosition(node, existingById))
    sizes.set(node.id, nodeSize(node))
  }
  for (const node of input.added) {
    if (node.type === 'group' && !input.added.some((child) => child.parentId === node.id)) {
      const size = emptyGroupSize(node)
      node.width ??= size.width
      node.height ??= size.height
    }
    sizes.set(node.id, estimateSize(node))
    if (input.fixed.has(node.id)) absolute.set(node.id, { ...node.position })
  }

  const containerOf = (node: DiagramNode): string | null => {
    let parentId = node.parentId
    while (parentId && floating.has(parentId)) parentId = addedById.get(parentId)?.parentId
    return parentId ?? null
  }
  const blocks = new Map<string | null, DiagramNode[]>()
  for (const node of input.added) {
    if (!floating.has(node.id)) continue
    const key = containerOf(node)
    let members = blocks.get(key)
    if (!members) blocks.set(key, (members = []))
    members.push(node)
  }

  const rectOf = (id: string): Rect => ({ ...absolute.get(id)!, ...sizes.get(id)! })
  const sizedByLayout = new Set<string>()
  const routes = new Map<string, XY[]>()
  const laidOutBlocks = await Promise.all(
    [...blocks].map(async ([container, members]) => {
      const memberIds = new Set(members.map((node) => node.id))
      const blockEdges = input.edges.filter((edge) => memberIds.has(edge.source) && memberIds.has(edge.target))
      const prepared = members.map((node) => ({
        ...node,
        parentId: node.parentId && memberIds.has(node.parentId) ? node.parentId : undefined,
        position: { x: 0, y: 0 },
      }))
      const result =
        members.length > 1 || members[0]?.type === 'group'
          ? await input.layout(prepared, blockEdges, input.direction)
          : { nodes: prepared, edges: blockEdges }
      return { container, members, memberIds, result }
    }),
  )

  for (const { container, members, memberIds, result } of laidOutBlocks) {
    const roots = members.filter((node) => !node.parentId || !memberIds.has(node.parentId))
    const laidOut = result.nodes
    const relative = new Map(laidOut.map((node) => [node.id, node]))

    for (const node of laidOut) {
      if (node.type !== 'group' || !node.width || !node.height) continue
      sizes.set(node.id, { width: node.width, height: node.height })
      sizedByLayout.add(node.id)
    }
    const texts = laidOut.filter((node) => node.type === 'text' && roots.some((root) => root.id === node.id))
    const placedRoots = roots.filter((root) => !texts.some((text) => text.id === root.id))
    let cursorY = 0
    for (const root of placedRoots) {
      const size = sizes.get(root.id)!
      cursorY = Math.max(cursorY, relative.get(root.id)!.position.y + size.height)
    }
    for (const text of texts) {
      relative.set(text.id, { ...text, position: { x: 0, y: cursorY + ROW_GAP_PX } })
      cursorY += ROW_GAP_PX + sizes.get(text.id)!.height
    }

    const block = unionRects(roots.map((root) => ({ ...relative.get(root.id)!.position, ...sizes.get(root.id)! })))!
    const free = blockOrigin({
      container,
      block,
      members: memberIds,
      edges: input.edges,
      occupied: occupiedRects(container, input, absolute, sizes, floating),
      rectOf,
      hasNode: (id) => absolute.has(id) && !floating.has(id),
    })
    const offset = { x: snapToGrid(free.x) - block.x, y: snapToGrid(free.y) - block.y }
    for (const edge of result.edges) {
      const route = edge.data?.route
      if (route)
        routes.set(
          edge.id,
          route.map((point) => ({ x: point.x + offset.x, y: point.y + offset.y })),
        )
    }

    const visit = (node: DiagramNode, parentAbsolute: Point) => {
      const position = relative.get(node.id)!.position
      const at = { x: parentAbsolute.x + position.x, y: parentAbsolute.y + position.y }
      absolute.set(node.id, at)
      for (const child of members) if (child.parentId === node.id) visit(child, at)
    }
    for (const root of roots) visit(root, offset)
  }

  for (const node of sortParentsFirst(input.added).toReversed()) {
    const sizeGiven = node.width !== undefined && node.height !== undefined && !floating.has(node.id)
    if (node.type !== 'group' || sizeGiven || sizedByLayout.has(node.id)) continue
    const inner = unionRects(input.added.filter((child) => child.parentId === node.id).map((child) => rectOf(child.id)))
    if (!inner) continue
    const frame = unionRects([{ ...absolute.get(node.id)!, ...MIN_GROUP_SIZE_PX }, groupRectAround(inner)])!
    absolute.set(node.id, { x: frame.x, y: frame.y })
    sizes.set(node.id, { width: frame.width, height: frame.height })
  }

  const added = sortParentsFirst(
    input.added.map((node) => {
      const at = absolute.get(node.id)!
      const position = relativePosition(at, node.parentId ? absolute.get(node.parentId) : undefined)
      const next: DiagramNode = { ...node, position }
      if (node.type === 'group') {
        const size = sizes.get(node.id)!
        next.width = size.width
        next.height = size.height
      }
      return next
    }),
  )
  const containers = laidOutBlocks.flatMap(({ container }) =>
    container !== null && existingById.has(container) ? [container] : [],
  )
  return { added, containers, routes }
}

function occupiedRects(
  container: string | null,
  input: PlacementInput,
  absolute: Map<string, Point>,
  sizes: Map<string, { width: number; height: number }>,
  floating: ReadonlySet<string>,
): Rect[] {
  const all = [...input.existing, ...input.added]
  return all
    .filter((node) => !floating.has(node.id) && (node.parentId ?? null) === container)
    .map((node) => ({ ...absolute.get(node.id)!, ...sizes.get(node.id)! }))
}

function blockOrigin(options: {
  container: string | null
  block: Rect
  members: ReadonlySet<string>
  edges: DiagramEdge[]
  occupied: Rect[]
  rectOf: (id: string) => Rect
  hasNode: (id: string) => boolean
}): Point {
  const { container, block, occupied } = options
  if (container !== null) {
    const parent = options.rectOf(container)
    const contentBottom = occupied.length > 0 ? Math.max(...occupied.map((rect) => rect.y + rect.height)) : null
    return {
      x: parent.x + GROUP_PADDING_PX.side,
      y: contentBottom === null ? parent.y + GROUP_PADDING_PX.top : contentBottom + ROW_GAP_PX,
    }
  }
  if (occupied.length === 0) return { x: 0, y: 0 }
  const neighbors = options.edges
    .flatMap((edge) => {
      if (options.members.has(edge.source) && !options.members.has(edge.target)) return [edge.target]
      if (options.members.has(edge.target) && !options.members.has(edge.source)) return [edge.source]
      return []
    })
    .filter(options.hasNode)
  const content = unionRects(occupied)!
  let start: Point
  if (neighbors.length > 0) {
    const neighbor = options.rectOf(neighbors[0]!)
    start = { x: neighbor.x + neighbor.width + NEIGHBOR_GAP_PX, y: neighbor.y }
  } else {
    start = { x: content.x + content.width + BLOCK_GAP_PX, y: content.y }
  }
  for (let slide = 0; slide < MAX_SLIDES; slide++) {
    const candidate = { x: start.x, y: start.y + slide * SLIDE_STEP_PX, width: block.width, height: block.height }
    if (!occupied.some((rect) => rectsOverlap(candidate, rect))) return { x: candidate.x, y: candidate.y }
  }
  return { x: content.x + content.width + BLOCK_GAP_PX, y: content.y }
}
