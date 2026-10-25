import { getBezierPath, getSmoothStepPath, getStraightPath, Position, type InternalNode } from '@xyflow/react'
import type { Rect } from '@/model/rect'
import type { EdgeData, Side, XY } from '@/model/schema'

export interface EdgeEndpoints {
  sourceX: number
  sourceY: number
  sourcePosition: Position
  targetX: number
  targetY: number
  targetPosition: Position
}

const POSITION_SIDE: Record<Position, Side> = {
  [Position.Top]: 'top',
  [Position.Right]: 'right',
  [Position.Bottom]: 'bottom',
  [Position.Left]: 'left',
}

const SIDE_POSITION: Record<Side, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
}

const HORIZONTAL_BIAS = 3

export function internalRect(node: InternalNode): Rect {
  return {
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    width: node.measured.width ?? node.width ?? 0,
    height: node.measured.height ?? node.height ?? 0,
  }
}

export function sidePoint(rect: Rect, side: Side): { x: number; y: number } {
  switch (side) {
    case 'top':
      return { x: rect.x + rect.width / 2, y: rect.y }
    case 'right':
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 }
    case 'bottom':
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height }
    case 'left':
      return { x: rect.x, y: rect.y + rect.height / 2 }
  }
}

/**
 * Returns the sides of two nodes that face each other.
 *
 * The function prefers the left and right sides. It uses the top and bottom sides if the nodes overlap on the x axis.
 * It also uses them if the vertical gap is more than three times the horizontal gap.
 */
export function facingSides(source: Rect, target: Rect): { source: Side; target: Side } {
  const dx = target.x + target.width / 2 - (source.x + source.width / 2)
  const dy = target.y + target.height / 2 - (source.y + source.height / 2)
  const gapX = Math.abs(dx) - (source.width + target.width) / 2
  const gapY = Math.abs(dy) - (source.height + target.height) / 2
  const horizontal = gapX > 0 ? gapX * HORIZONTAL_BIAS >= gapY : gapY <= 0
  if (horizontal) return dx >= 0 ? { source: 'right', target: 'left' } : { source: 'left', target: 'right' }
  return dy >= 0 ? { source: 'bottom', target: 'top' } : { source: 'top', target: 'bottom' }
}

export function autoEndpoints(source: Rect, target: Rect): EdgeEndpoints {
  const sides = facingSides(source, target)
  const start = sidePoint(source, sides.source)
  const end = sidePoint(target, sides.target)
  return {
    sourceX: start.x,
    sourceY: start.y,
    sourcePosition: SIDE_POSITION[sides.source],
    targetX: end.x,
    targetY: end.y,
    targetPosition: SIDE_POSITION[sides.target],
  }
}

export function positionSide(position: Position): Side {
  return POSITION_SIDE[position]
}

export function edgePath(kind: EdgeData['path'], ends: EdgeEndpoints): [path: string, labelX: number, labelY: number] {
  switch (kind) {
    case 'bezier': {
      const [path, x, y] = getBezierPath({ ...ends, curvature: 0.32 })
      return [path, x, y]
    }
    case 'smooth': {
      const [path, x, y] = getSmoothStepPath({ ...ends, borderRadius: 12, offset: 22 })
      return [path, x, y]
    }
    case 'step': {
      const [path, x, y] = getSmoothStepPath({ ...ends, borderRadius: 0, offset: 22 })
      return [path, x, y]
    }
    case 'straight': {
      const [path, x, y] = getStraightPath(ends)
      return [path, x, y]
    }
  }
}

/** The distance within which the end of a route counts as on a node border. */
const ROUTE_TOLERANCE_PX = 4

function touchesBorder(point: XY, rect: Rect) {
  const inside =
    point.x >= rect.x - ROUTE_TOLERANCE_PX &&
    point.x <= rect.x + rect.width + ROUTE_TOLERANCE_PX &&
    point.y >= rect.y - ROUTE_TOLERANCE_PX &&
    point.y <= rect.y + rect.height + ROUTE_TOLERANCE_PX
  const nearSide =
    Math.abs(point.x - rect.x) <= ROUTE_TOLERANCE_PX ||
    Math.abs(point.x - (rect.x + rect.width)) <= ROUTE_TOLERANCE_PX ||
    Math.abs(point.y - rect.y) <= ROUTE_TOLERANCE_PX ||
    Math.abs(point.y - (rect.y + rect.height)) <= ROUTE_TOLERANCE_PX
  return inside && nearSide
}

/** Returns true if a layout route still starts on the source node and ends on the target node. */
export function routeFits(route: readonly XY[], source: Rect, target: Rect): boolean {
  const first = route[0]
  const last = route.at(-1)
  return route.length >= 2 && !!first && !!last && touchesBorder(first, source) && touchesBorder(last, target)
}

function distance(a: XY, b: XY) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function toward(from: XY, to: XY, length: number): XY {
  const total = distance(from, to)
  return total === 0
    ? from
    : { x: from.x + ((to.x - from.x) * length) / total, y: from.y + ((to.y - from.y) * length) / total }
}

/**
 * Returns SVG path data along route points, with round corners.
 *
 * @param radiusPx - The corner radius. A corner gets at most half of its shorter segment.
 */
export function routePath(route: readonly XY[], radiusPx: number): string {
  const points = route.filter((point, index) => index === 0 || distance(point, route[index - 1]!) > 0.01)
  const first = points[0]
  if (!first) return ''
  const parts = [`M${first.x},${first.y}`]
  for (let index = 1; index < points.length - 1; index++) {
    const previous = points[index - 1]!
    const corner = points[index]!
    const next = points[index + 1]!
    const r = Math.min(radiusPx, distance(previous, corner) / 2, distance(corner, next) / 2)
    const before = toward(corner, previous, r)
    const after = toward(corner, next, r)
    parts.push(`L${before.x},${before.y}`, `Q${corner.x},${corner.y} ${after.x},${after.y}`)
  }
  const last = points.at(-1)!
  if (points.length > 1) parts.push(`L${last.x},${last.y}`)
  return parts.join(' ')
}
