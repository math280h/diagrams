import { rectsOverlap, type Rect } from '@/model/rect'
import type { XY } from '@/model/schema'
import type { Viewport } from './camera'

export type CalloutSide = 'top' | 'right' | 'bottom' | 'left'

/** The place of a caption card, in screen pixels from the top left of the canvas. */
export interface CalloutPlacement {
  x: number
  y: number
  /**
   * The side of the anchor where the card is. The tail of the card points back at the anchor. Without it, no place
   * next to the anchor is free, and the card shows at the edge of the bounds without a tail.
   */
  side?: CalloutSide
  /** The distance from the start of the card edge that faces the anchor to the point of the tail. */
  tailPx: number
  /** The length of the line from the card edge to the anchor, in screen pixels. */
  reachPx: number
}

/** Points along a line and the rectangle around them, in canvas pixels. An `ArcTable` has this shape. */
export interface CalloutPath {
  xs: ArrayLike<number>
  ys: ArrayLike<number>
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * The node rectangle or the edge that a card points at, in canvas pixels. A card above a node also keeps `topClear`
 * free above the rectangle.
 */
export type CalloutAnchor = { kind: 'rect'; rect: Rect; topClear: number } | { kind: 'path'; path: CalloutPath }

/** Areas in canvas pixels that a card must not cover. */
export interface CalloutObstacles {
  rects: readonly Rect[]
  paths: readonly CalloutPath[]
}

export interface CalloutRequest {
  anchor: CalloutAnchor
  viewport: Viewport
  /** The card size in screen pixels. */
  width: number
  height: number
  /** The part of the view that the card stays in, in screen pixels. */
  bounds: Rect
  /**
   * The obstacles, the most important first. When no place next to the anchor is free of all of them, the placement
   * ignores the last tiers, one at a time. It never ignores the first tier.
   */
  tiers: readonly CalloutObstacles[]
  /** The distance in screen pixels between the card and a path, for example for the label on an edge. */
  lineClearPx: number
}

const DISTANCES_PX = [10, 46, 82] as const
const CLEAR_PX = 6
const TAIL_INSET_PX = 16
const LINE_GAP_PX = 4
const DIRECTION_SPAN = 3
const PATH_FRACTIONS = [0.5, 0.3, 0.7, 0.15, 0.85]
const SLIDES = [0, 1, 0.25, 0.75]
const NODE_SIDES: readonly CalloutSide[] = ['right', 'left', 'bottom', 'top']
const ACROSS_HORIZONTAL: readonly CalloutSide[] = ['top', 'bottom', 'right', 'left']
const ACROSS_VERTICAL: readonly CalloutSide[] = ['right', 'left', 'top', 'bottom']
const TOLERANCE_PX = 0.5

interface Spot {
  /** The area that the card keeps clear of, in screen pixels. */
  rect: Rect
  /** The part of the anchor inside the bounds, in screen pixels. The tail points at it. */
  visible: Rect
  sides: readonly CalloutSide[]
  /** The part of `rect` that the line from the card goes into. */
  innerReachPx: number
}

interface Candidate {
  card: Rect
  /** The line from the card to the anchor. */
  stem: Rect
  tailPx: number
  reachPx: number
}

function inflate(rect: Rect, by: number): Rect {
  return { x: rect.x - by, y: rect.y - by, width: rect.width + by * 2, height: rect.height + by * 2 }
}

function intersection(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  return right >= x && bottom >= y ? { x, y, width: right - x, height: bottom - y } : null
}

function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height
}

function toCanvas(rect: Rect, { x, y, zoom }: Viewport): Rect {
  return { x: (rect.x - x) / zoom, y: (rect.y - y) / zoom, width: rect.width / zoom, height: rect.height / zoom }
}

function segmentHitsRect(ax: number, ay: number, bx: number, by: number, rect: Rect): boolean {
  const left = rect.x
  const right = rect.x + rect.width
  const top = rect.y
  const bottom = rect.y + rect.height
  if (Math.max(ax, bx) < left || Math.min(ax, bx) > right) return false
  if (Math.max(ay, by) < top || Math.min(ay, by) > bottom) return false
  const dx = bx - ax
  const dy = by - ay
  let low = 0
  let high = 1
  for (const [p, q] of [
    [-dx, ax - left],
    [dx, right - ax],
    [-dy, ay - top],
    [dy, bottom - ay],
  ] as const) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const t = q / p
    if (p < 0) low = Math.max(low, t)
    else high = Math.min(high, t)
    if (low > high) return false
  }
  return true
}

function pathHitsRect(path: CalloutPath, rect: Rect): boolean {
  if (path.maxX < rect.x || path.minX > rect.x + rect.width) return false
  if (path.maxY < rect.y || path.minY > rect.y + rect.height) return false
  const { xs, ys } = path
  if (xs.length === 1) return contains(rect, xs[0]!, ys[0]!)
  for (let i = 1; i < xs.length; i++) {
    if (segmentHitsRect(xs[i - 1]!, ys[i - 1]!, xs[i]!, ys[i]!, rect)) return true
  }
  return false
}

function isClear(candidate: Candidate, request: CalloutRequest, tiers: readonly CalloutObstacles[]): boolean {
  const { viewport, lineClearPx } = request
  const card = toCanvas(candidate.card, viewport)
  const padded = inflate(card, CLEAR_PX / viewport.zoom)
  const lined = inflate(card, lineClearPx / viewport.zoom)
  const stem = toCanvas(candidate.stem, viewport)
  return tiers.every(
    ({ rects, paths }) =>
      rects.every((rect) => !rectsOverlap(padded, rect) && !rectsOverlap(stem, rect)) &&
      paths.every((path) => !pathHitsRect(path, lined)),
  )
}

function longestRun(points: readonly XY[], bounds: Rect): [number, number] | null {
  let best: [number, number] | null = null
  let start = -1
  for (let index = 0; index < points.length; index++) {
    const inside = contains(bounds, points[index]!.x, points[index]!.y)
    if (inside && start < 0) start = index
    if (start >= 0 && (!inside || index === points.length - 1)) {
      const end = inside ? index : index - 1
      if (!best || end - start > best[1] - best[0]) best = [start, end]
      start = -1
    }
  }
  return best
}

function pathSpots({ xs, ys }: CalloutPath, request: CalloutRequest): Spot[] {
  const { viewport, bounds, lineClearPx } = request
  const points = Array.from(xs, (x, index) => ({
    x: x * viewport.zoom + viewport.x,
    y: ys[index]! * viewport.zoom + viewport.y,
  }))
  const run = longestRun(points, bounds)
  if (!run) return []
  const [first, last] = run
  const middle = Math.round((points.length - 1) / 2)
  const indices = [
    ...(middle >= first && middle <= last ? [middle] : []),
    ...PATH_FRACTIONS.map((fraction) => Math.round(first + (last - first) * fraction)),
  ].filter((index, position, all) => all.indexOf(index) === position)
  return indices.map((index) => {
    const point = points[index]!
    const before = points[Math.max(0, index - DIRECTION_SPAN)]!
    const after = points[Math.min(points.length - 1, index + DIRECTION_SPAN)]!
    const horizontal = Math.abs(after.x - before.x) >= Math.abs(after.y - before.y)
    const rect = inflate({ x: point.x, y: point.y, width: 0, height: 0 }, lineClearPx)
    return {
      rect,
      visible: rect,
      sides: horizontal ? ACROSS_HORIZONTAL : ACROSS_VERTICAL,
      innerReachPx: Math.max(0, lineClearPx - LINE_GAP_PX),
    }
  })
}

function spotsOf(request: CalloutRequest): Spot[] {
  const { anchor, viewport, bounds } = request
  if (anchor.kind === 'path') return pathSpots(anchor.path, request)
  const clear = anchor.topClear * viewport.zoom
  const node = {
    x: anchor.rect.x * viewport.zoom + viewport.x,
    y: anchor.rect.y * viewport.zoom + viewport.y,
    width: anchor.rect.width * viewport.zoom,
    height: anchor.rect.height * viewport.zoom,
  }
  const visible = intersection(node, bounds)
  const rect = { ...node, y: node.y - clear, height: node.height + clear }
  return visible ? [{ rect, visible, sides: NODE_SIDES, innerReachPx: 0 }] : []
}

function startsAlongSide(
  spanLow: number,
  spanHigh: number,
  length: number,
  low: number,
  high: number,
): { start: number; tail: number }[] {
  const inset = Math.min(TAIL_INSET_PX, length / 2)
  const centre = (spanLow + spanHigh) / 2
  const tailLow = Math.min(centre, spanLow + TAIL_INSET_PX)
  const tailHigh = Math.max(centre, spanHigh - TAIL_INSET_PX)
  const min = Math.max(low, tailLow - length + inset)
  const max = Math.min(high - length, tailHigh - inset)
  if (min > max + TOLERANCE_PX) return []
  const clamp = (value: number, from: number, to: number) => Math.min(Math.max(value, from), to)
  return [clamp(centre - length / 2, min, max), ...SLIDES.map((share) => min + (max - min) * share)]
    .filter((start, index, all) => all.findIndex((other) => Math.abs(other - start) < 1) === index)
    .map((start) => ({
      start,
      tail: clamp(clamp(centre, start + inset, start + length - inset), tailLow, tailHigh),
    }))
}

function candidates(spot: Spot, side: CalloutSide, distance: number, request: CalloutRequest): Candidate[] {
  const { width, height, bounds } = request
  const { rect, visible } = spot
  const reachPx = distance + spot.innerReachPx
  const stemLength = Math.max(0, distance - 1)
  if (side === 'left' || side === 'right') {
    const x = side === 'right' ? rect.x + rect.width + distance : rect.x - distance - width
    if (x < bounds.x - TOLERANCE_PX || x + width > bounds.x + bounds.width + TOLERANCE_PX) return []
    const stemX = side === 'right' ? x - stemLength : x + width
    const starts = startsAlongSide(visible.y, visible.y + visible.height, height, bounds.y, bounds.y + bounds.height)
    return starts.map(({ start, tail }) => ({
      card: { x, y: start, width, height },
      stem: { x: stemX, y: tail, width: stemLength, height: 0 },
      tailPx: tail - start,
      reachPx,
    }))
  }
  const y = side === 'bottom' ? rect.y + rect.height + distance : rect.y - distance - height
  if (y < bounds.y - TOLERANCE_PX || y + height > bounds.y + bounds.height + TOLERANCE_PX) return []
  const stemY = side === 'bottom' ? y - stemLength : y + height
  const starts = startsAlongSide(visible.x, visible.x + visible.width, width, bounds.x, bounds.x + bounds.width)
  return starts.map(({ start, tail }) => ({
    card: { x: start, y, width, height },
    stem: { x: tail, y: stemY, width: 0, height: stemLength },
    tailPx: tail - start,
    reachPx,
  }))
}

function boundsPlacement(request: CalloutRequest, spot: Spot): CalloutPlacement {
  const { width, height, bounds, tiers } = request
  const left = bounds.x
  const right = Math.max(left, bounds.x + bounds.width - width)
  const top = bounds.y
  const bottom = Math.max(top, bounds.y + bounds.height - height)
  const centreX = spot.visible.x + spot.visible.width / 2
  const centreY = spot.visible.y + spot.visible.height / 2
  const distance = ({ x, y }: XY) => Math.hypot(x + width / 2 - centreX, y + height / 2 - centreY)
  const places = [left, (left + right) / 2, right]
    .flatMap((x) => [top, bottom].map((y) => ({ x, y })))
    .toSorted((a, b) => distance(a) - distance(b))
  const free = places.find((place) =>
    isClear(
      { card: { ...place, width, height }, stem: { ...place, width: 0, height: 0 }, tailPx: 0, reachPx: 0 },
      request,
      tiers.slice(0, 1),
    ),
  )
  return { ...(free ?? places[0]!), tailPx: 0, reachPx: 0 }
}

/**
 * Returns a place for a caption card next to its anchor, inside the bounds, that covers no obstacle of the first tier.
 * The card goes to the first free side of the anchor, in a fixed order of sides and distances. The result depends
 * only on the request.
 *
 * @returns The place, or `null` if no part of the anchor is inside the bounds.
 */
export function placeCallout(request: CalloutRequest): CalloutPlacement | null {
  const spots = spotsOf(request)
  if (spots.length === 0) return null
  for (let count = request.tiers.length; count >= 1; count--) {
    const active = request.tiers.slice(0, count)
    for (const distance of DISTANCES_PX) {
      for (const spot of spots) {
        for (const side of spot.sides) {
          for (const candidate of candidates(spot, side, distance, request)) {
            if (isClear(candidate, request, active)) {
              const { card, tailPx, reachPx } = candidate
              return { x: card.x, y: card.y, side, tailPx, reachPx }
            }
          }
        }
      }
    }
  }
  return boundsPlacement(request, spots[0]!)
}
