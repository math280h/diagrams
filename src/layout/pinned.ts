import { absolutePosition, estimateSize, GROUP_PADDING_PX, groupRectAround, sortParentsFirst } from '@/model/graph'
import { rectsOverlap, unionRects, type Rect } from '@/model/rect'
import type { XY } from '@/model/schema'
import type { DiagramEdge, DiagramNode } from '@/model/types'

/** The space that the layout keeps between a pinned node and a node that it moves away from it, in canvas pixels. */
const CLEARANCE_PX = 48
const MAX_PASSES = 40

export function isPinned(node: DiagramNode): boolean {
  return node.data.pinned === true
}

function median(values: number[]): number {
  const sorted = values.toSorted((a, b) => a - b)
  const middle = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

function grown(rect: Rect, by: number): Rect {
  return { x: rect.x - by, y: rect.y - by, width: rect.width + by * 2, height: rect.height + by * 2 }
}

/** Returns how far `rect` must move along one axis to leave `obstacle`, the shorter way out. */
function exit(rect: Rect, obstacle: Rect): XY {
  const right = obstacle.x + obstacle.width - rect.x
  const left = rect.x + rect.width - obstacle.x
  const down = obstacle.y + obstacle.height - rect.y
  const up = rect.y + rect.height - obstacle.y
  const dx = right < left ? right : -left
  const dy = down < up ? down : -up
  return Math.abs(dx) < Math.abs(dy) ? { x: dx, y: 0 } : { x: 0, y: dy }
}

/**
 * Keeps the pinned nodes of a layout in their places.
 *
 * The other nodes keep their arrangement from the layout. The arrangement moves so that the pinned nodes are near their
 * places in it, by the median offset of the pinned nodes. Each pinned node and everything in a pinned group then goes
 * back to its place, and the arranged nodes move out of its way. A group that holds a pinned node grows around it.
 *
 * @param nodes - The nodes before the layout, with their places.
 * @param laidOut - The layout of the same nodes and edges.
 */
export function keepPinned(
  nodes: readonly DiagramNode[],
  laidOut: { nodes: DiagramNode[]; edges: DiagramEdge[] },
): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  const before = new Map(nodes.map((node) => [node.id, node]))
  const after = new Map(laidOut.nodes.map((node) => [node.id, node]))
  const pinnedTree = new Set<string>()
  for (const node of sortParentsFirst([...nodes])) {
    if (isPinned(node) || (node.parentId !== undefined && pinnedTree.has(node.parentId))) pinnedTree.add(node.id)
  }
  if (pinnedTree.size === 0) return laidOut

  const oldAt = new Map(nodes.map((node) => [node.id, absolutePosition(node, before)]))
  const newAt = new Map(laidOut.nodes.map((node) => [node.id, absolutePosition(node, after)]))
  const anchors = [...pinnedTree].filter((id) => !pinnedTree.has(before.get(id)?.parentId ?? '') && newAt.has(id))
  const shift = {
    x: median(anchors.map((id) => oldAt.get(id)!.x - newAt.get(id)!.x)),
    y: median(anchors.map((id) => oldAt.get(id)!.y - newAt.get(id)!.y)),
  }

  const placed = new Map<string, XY>()
  const sizes = new Map<string, { width: number; height: number }>()
  for (const node of laidOut.nodes) {
    const pinned = pinnedTree.has(node.id)
    const at = pinned ? oldAt.get(node.id)! : newAt.get(node.id)!
    placed.set(node.id, pinned ? at : { x: at.x + shift.x, y: at.y + shift.y })
    sizes.set(node.id, estimateSize(pinned ? (before.get(node.id) ?? node) : node))
  }
  const rectOf = (id: string): Rect => ({ ...placed.get(id)!, ...sizes.get(id)! })
  const parentOf = (id: string) => (pinnedTree.has(id) ? before.get(id)?.parentId : after.get(id)?.parentId)

  const children = new Map<string | null, string[]>()
  for (const node of laidOut.nodes) {
    const parentId = parentOf(node.id)
    const key = parentId && placed.has(parentId) ? parentId : null
    children.set(key, [...(children.get(key) ?? []), node.id])
  }
  const holdsPinned = new Set<string>()
  for (const id of pinnedTree) {
    for (let parentId = parentOf(id); parentId; parentId = parentOf(parentId)) holdsPinned.add(parentId)
  }

  const extra = new Map<string, XY>()
  const moveTree = (id: string, by: XY) => {
    const at = placed.get(id)!
    placed.set(id, { x: at.x + by.x, y: at.y + by.y })
    const total = extra.get(id) ?? { x: 0, y: 0 }
    extra.set(id, { x: total.x + by.x, y: total.y + by.y })
    for (const child of children.get(id) ?? []) moveTree(child, by)
  }

  const separate = (members: readonly string[]) => {
    const fixed = members.filter((id) => pinnedTree.has(id) || holdsPinned.has(id))
    const movable = members
      .filter((id) => !fixed.includes(id))
      .toSorted((a, b) => rectOf(a).x - rectOf(b).x || rectOf(a).y - rectOf(b).y)
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      let moved = false
      movable.forEach((id, index) => {
        for (const other of [...fixed, ...movable.slice(0, index)]) {
          const clearance = fixed.includes(other) ? CLEARANCE_PX : GROUP_PADDING_PX.side
          const obstacle = grown(rectOf(other), clearance)
          if (!rectsOverlap(rectOf(id), obstacle)) continue
          moveTree(id, exit(rectOf(id), obstacle))
          moved = true
        }
      })
      if (!moved) break
    }
  }

  const groupsDeepestFirst = sortParentsFirst([...laidOut.nodes])
    .toReversed()
    .filter((node) => node.type === 'group' && !pinnedTree.has(node.id))
  for (const group of groupsDeepestFirst) {
    const members = children.get(group.id) ?? []
    separate(members)
    const inner = unionRects(members.map(rectOf))
    if (!inner) continue
    const frame = unionRects([rectOf(group.id), groupRectAround(inner)])!
    placed.set(group.id, { x: frame.x, y: frame.y })
    sizes.set(group.id, { width: frame.width, height: frame.height })
  }
  separate(children.get(null) ?? [])

  const relative = (id: string): XY => {
    const parentId = parentOf(id)
    const at = placed.get(id)!
    if (!parentId || !placed.has(parentId)) return at
    const parent = placed.get(parentId)!
    return { x: at.x - parent.x, y: at.y - parent.y }
  }
  const resultNodes = laidOut.nodes.map((node): DiagramNode => {
    const source = pinnedTree.has(node.id) ? (before.get(node.id) ?? node) : node
    const next = { ...source, position: relative(node.id) }
    if (node.type === 'group') {
      const size = sizes.get(node.id)!
      return { ...next, width: size.width, height: size.height }
    }
    return next
  })

  return { nodes: resultNodes, edges: laidOut.edges }
}
