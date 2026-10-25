import type { Rect } from './rect'
import type { DiagramNode } from './types'

export const DEFAULT_NODE_SIZE = { width: 216, height: 72 }

/** The space between a group border and the nodes in it. The top leaves room for the label. */
export const GROUP_PADDING_PX = { top: 56, side: 32, bottom: 32 }

/** Returns the rectangle of a group that holds the inner rectangle with the group padding. */
export function groupRectAround(inner: Rect): Rect {
  return {
    x: inner.x - GROUP_PADDING_PX.side,
    y: inner.y - GROUP_PADDING_PX.top,
    width: inner.width + GROUP_PADDING_PX.side * 2,
    height: inner.height + GROUP_PADDING_PX.top + GROUP_PADDING_PX.bottom,
  }
}

/**
 * The stacking order of cards, shapes and text.
 *
 * React Flow puts a child node one step above its parent. Groups start at -1, so this value keeps
 * all other nodes above the groups at every depth.
 */
export const ELEMENT_Z = 1000

/** The distance between grid points. Snapped nodes sit on grid points. */
export const GRID_PX = 16

export function snapToGrid(value: number): number {
  return Math.round(value / GRID_PX) * GRID_PX
}

export function nodeSize(node: DiagramNode): { width: number; height: number } {
  return {
    width: node.measured?.width ?? node.width ?? DEFAULT_NODE_SIZE.width,
    height: node.measured?.height ?? node.height ?? DEFAULT_NODE_SIZE.height,
  }
}

/** Returns the size of a node before React Flow measures it. */
export function estimateSize(node: DiagramNode): { width: number; height: number } {
  if (node.measured?.width && node.measured.height) {
    return { width: node.measured.width, height: node.measured.height }
  }
  if (node.width && node.height) return { width: node.width, height: node.height }
  switch (node.type) {
    case 'card':
      return {
        width: node.width ?? DEFAULT_NODE_SIZE.width,
        height: 44 + node.data.lines.length * 19 + (node.data.meter !== null ? 24 : 0),
      }
    case 'text':
      return { width: node.width ?? 160, height: 32 }
    default:
      return { width: node.width ?? 160, height: node.height ?? 72 }
  }
}

/** Returns the node position in canvas coordinates. It adds the positions of all parent groups. */
export function absolutePosition(node: DiagramNode, byId: ReadonlyMap<string, DiagramNode>): { x: number; y: number } {
  let x = node.position.x
  let y = node.position.y
  let parentId = node.parentId
  let guard = 0
  while (parentId && guard++ < 32) {
    const parent = byId.get(parentId)
    if (!parent) break
    x += parent.position.x
    y += parent.position.y
    parentId = parent.parentId
  }
  return { x, y }
}

/** Returns a canvas position relative to the canvas position of a parent, or `absolute` for a top-level node. */
export function relativePosition(
  absolute: { x: number; y: number },
  parentAbsolute: { x: number; y: number } | undefined,
): { x: number; y: number } {
  return parentAbsolute ? { x: absolute.x - parentAbsolute.x, y: absolute.y - parentAbsolute.y } : absolute
}

export function absoluteRect(node: DiagramNode, byId: ReadonlyMap<string, DiagramNode>): Rect {
  return { ...absolutePosition(node, byId), ...nodeSize(node) }
}

export function sortParentsFirst(nodes: DiagramNode[]): DiagramNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const depth = (node: DiagramNode) => {
    let level = 0
    let parentId = node.parentId
    while (parentId && level < 32) {
      level++
      parentId = byId.get(parentId)?.parentId
    }
    return level
  }
  const withDepth = nodes.map((node, index) => ({ node, index, level: depth(node) }))
  withDepth.sort((a, b) => a.level - b.level || a.index - b.index)
  return withDepth.map((entry) => entry.node)
}

export function descendantIds(rootIds: Iterable<string>, nodes: DiagramNode[]): Set<string> {
  const result = new Set(rootIds)
  let grew = true
  while (grew) {
    grew = false
    for (const node of nodes) {
      if (node.parentId && result.has(node.parentId) && !result.has(node.id)) {
        result.add(node.id)
        grew = true
      }
    }
  }
  return result
}
