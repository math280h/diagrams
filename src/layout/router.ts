import type { Rect } from '@/model/rect'
import type { XY } from '@/model/schema'
import { roundHalf } from './types'

export interface RouterNode {
  id: string
  /** The rectangle of the node in canvas coordinates. */
  rect: Rect
  parentId?: string
}

export interface RouterEdge {
  id: string
  source: string
  target: string
}

/** The distance between a route and a node that it passes. */
const CLEARANCE_PX = 20
/** The cost of one bend, as extra route length. */
const BEND_COST_PX = 140
/** The extra cost factor for each earlier route on the same grid segment. */
const REUSE_COST = 0.8
/** The extra cost factor for a route along a line at the clearance distance instead of the middle of a channel. */
const EDGE_TRACK_COST = 0.15
/** The distance between parallel routes after the nudge step. */
const ROUTE_SPACING_PX = 12
/** The space between a route and the corner of a node side where it enters. */
const PORT_MARGIN_PX = 10

const RIGHT = 0
const DOWN = 1
const LEFT = 2
const UP = 3
const STEP_X = [1, 0, -1, 0]
const STEP_Y = [0, 1, 0, -1]

const opposite = (direction: number) => (direction + 2) % 4

interface Port {
  point: XY
  stub: XY
  /** The direction from the port to the stub. */
  outward: number
}

function portsOf(rect: Rect): Port[] {
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height
  return [
    { point: { x: right, y: cy }, stub: { x: right + CLEARANCE_PX, y: cy }, outward: RIGHT },
    { point: { x: cx, y: bottom }, stub: { x: cx, y: bottom + CLEARANCE_PX }, outward: DOWN },
    { point: { x: rect.x, y: cy }, stub: { x: rect.x - CLEARANCE_PX, y: cy }, outward: LEFT },
    { point: { x: cx, y: rect.y }, stub: { x: cx, y: rect.y - CLEARANCE_PX }, outward: UP },
  ]
}

/** Returns the sorted unique coordinates, with the middle of each gap between neighbours added as a channel line. */
function gridLines(values: number[]): { lines: number[]; channel: Uint8Array } {
  const sorted = [...new Set(values.map(roundHalf))].toSorted((a, b) => a - b)
  const lines: number[] = []
  const channel: number[] = []
  for (let index = 0; index < sorted.length; index++) {
    lines.push(sorted[index]!)
    channel.push(0)
    const next = sorted[index + 1]
    if (next !== undefined && next - sorted[index]! > CLEARANCE_PX) {
      lines.push(roundHalf((sorted[index]! + next) / 2))
      channel.push(1)
    }
  }
  return { lines, channel: Uint8Array.from(channel) }
}

class MinHeap {
  private keys: number[] = []
  private values: number[] = []

  get size() {
    return this.values.length
  }

  push(key: number, value: number) {
    this.keys.push(key)
    this.values.push(value)
    let index = this.values.length - 1
    while (index > 0) {
      const parent = (index - 1) >> 1
      if (this.keys[parent]! <= this.keys[index]!) break
      this.swap(index, parent)
      index = parent
    }
  }

  pop(): number {
    const top = this.values[0]!
    const lastKey = this.keys.pop()!
    const lastValue = this.values.pop()!
    if (this.values.length > 0) {
      this.keys[0] = lastKey
      this.values[0] = lastValue
      let index = 0
      for (;;) {
        const left = index * 2 + 1
        const right = left + 1
        let smallest = index
        if (left < this.keys.length && this.keys[left]! < this.keys[smallest]!) smallest = left
        if (right < this.keys.length && this.keys[right]! < this.keys[smallest]!) smallest = right
        if (smallest === index) break
        this.swap(index, smallest)
        index = smallest
      }
    }
    return top
  }

  private swap(a: number, b: number) {
    ;[this.keys[a], this.keys[b]] = [this.keys[b]!, this.keys[a]!]
    ;[this.values[a], this.values[b]] = [this.values[b]!, this.values[a]!]
  }
}

function simplify(points: XY[]): XY[] {
  const out: XY[] = []
  for (const point of points) {
    const last = out.at(-1)
    if (last && Math.abs(last.x - point.x) < 0.01 && Math.abs(last.y - point.y) < 0.01) continue
    const before = out.at(-2)
    if (
      before &&
      last &&
      ((Math.abs(before.x - last.x) < 0.01 && Math.abs(last.x - point.x) < 0.01) ||
        (Math.abs(before.y - last.y) < 0.01 && Math.abs(last.y - point.y) < 0.01))
    ) {
      out[out.length - 1] = point
      continue
    }
    out.push(point)
  }
  return out
}

function strictlyInside(rect: Rect, x: number, y: number, inset: number) {
  return x > rect.x - inset && x < rect.x + rect.width + inset && y > rect.y - inset && y < rect.y + rect.height + inset
}

const NO_COVER: readonly number[] = []

/**
 * The search grid: lines at the clearance around each node, at the middle of each end node and in each wide channel.
 * A cover lists the nodes whose clearance area holds a grid point or the middle of the grid segment after it.
 */
interface Grid {
  xs: number[]
  ys: number[]
  columns: number
  rows: number
  xChannel: Uint8Array
  yChannel: Uint8Array
  pointCover: (readonly number[])[]
  rightCover: (readonly number[])[]
  downCover: (readonly number[])[]
  pointAt: (point: number) => XY
  /** Returns the grid point at a canvas position, or `undefined` if no grid lines cross there. */
  pointNear: (position: XY) => number | undefined
}

function buildGrid(nodes: readonly RouterNode[], endpoints: ReadonlySet<string>): Grid {
  const xValues: number[] = []
  const yValues: number[] = []
  for (const node of nodes) {
    const { x, y, width, height } = node.rect
    xValues.push(x - CLEARANCE_PX, x + width + CLEARANCE_PX)
    yValues.push(y - CLEARANCE_PX, y + height + CLEARANCE_PX)
    if (endpoints.has(node.id)) {
      xValues.push(x + width / 2)
      yValues.push(y + height / 2)
    }
  }
  const { lines: xs, channel: xChannel } = gridLines(xValues)
  const { lines: ys, channel: yChannel } = gridLines(yValues)
  const columns = xs.length
  const rows = ys.length
  const xIndex = new Map(xs.map((value, index) => [value, index]))
  const yIndex = new Map(ys.map((value, index) => [value, index]))

  const inset = CLEARANCE_PX - 0.5
  const across = (y: number) =>
    nodes.flatMap((node, index) =>
      y > node.rect.y - inset && y < node.rect.y + node.rect.height + inset ? [index] : [],
    )
  const covering = (x: number, y: number, candidates: number[]): readonly number[] => {
    const found = candidates.filter((index) => strictlyInside(nodes[index]!.rect, x, y, inset))
    return found.length > 0 ? found : NO_COVER
  }
  const pointCount = columns * rows
  const pointCover: (readonly number[])[] = Array.from({ length: pointCount })
  const rightCover: (readonly number[])[] = Array.from({ length: pointCount })
  const downCover: (readonly number[])[] = Array.from({ length: pointCount })
  for (let yi = 0; yi < rows; yi++) {
    const y = ys[yi]!
    const rowNodes = across(y)
    const middleY = yi + 1 < rows ? (y + ys[yi + 1]!) / 2 : y
    const middleNodes = across(middleY)
    for (let xi = 0; xi < columns; xi++) {
      const x = xs[xi]!
      const point = yi * columns + xi
      pointCover[point] = covering(x, y, rowNodes)
      rightCover[point] = covering(xi + 1 < columns ? (x + xs[xi + 1]!) / 2 : x, y, rowNodes)
      downCover[point] = covering(x, middleY, middleNodes)
    }
  }

  return {
    xs,
    ys,
    columns,
    rows,
    xChannel,
    yChannel,
    pointCover,
    rightCover,
    downCover,
    pointAt: (point) => ({ x: xs[point % columns]!, y: ys[Math.floor(point / columns)]! }),
    pointNear: (position) => {
      const xi = xIndex.get(roundHalf(position.x))
      const yi = yIndex.get(roundHalf(position.y))
      return xi === undefined || yi === undefined ? undefined : yi * columns + xi
    },
  }
}

/**
 * Creates an A* search over the grid states (grid point and direction of travel).
 *
 * Each route that the search finds raises the cost of its grid segments for later routes.
 */
function createSearch(grid: Grid) {
  const { xs, ys, columns, rows } = grid
  const pointCount = columns * rows
  const doneBase = pointCount * 4
  const usage = new Uint16Array(pointCount * 2)
  const best = new Float64Array(pointCount * 4)
  const previous = new Int32Array(pointCount * 4)
  const stamp = new Uint32Array(pointCount * 4)
  let generation = 0

  const costOf = (state: number) => (stamp[state] === generation ? best[state]! : Infinity)
  const visit = (state: number, cost: number, from: number) => {
    stamp[state] = generation
    best[state] = cost
    previous[state] = from
  }

  /**
   * Finds the route between two nodes.
   *
   * @param open - Marks the nodes that the route may pass: its ends and the groups that hold them.
   * @returns The points from the source border to the target border, or `null` if no route exists.
   */
  return function route(source: Rect, target: Rect, open: Uint8Array): XY[] | null {
    generation++
    const blocked = (cover: readonly number[]) => {
      for (const index of cover) if (!open[index]) return true
      return false
    }
    const inEnd = (x: number, y: number) => strictlyInside(source, x, y, 0) || strictlyInside(target, x, y, 0)

    const goals = new Map<number, Port>()
    for (const port of portsOf(target)) {
      const point = grid.pointNear(port.stub)
      if (point !== undefined && !blocked(grid.pointCover[point]!)) goals.set(point, port)
    }
    if (goals.size === 0) return null
    const goalPoints = [...goals.keys()].map(grid.pointAt)
    const heuristic = (point: number) => {
      const { x, y } = grid.pointAt(point)
      let lowest = Infinity
      for (const goal of goalPoints) lowest = Math.min(lowest, Math.abs(x - goal.x) + Math.abs(y - goal.y))
      return lowest
    }

    const heap = new MinHeap()
    let doneCost = Infinity
    let doneState = -1
    for (const port of portsOf(source)) {
      const point = grid.pointNear(port.stub)
      if (point === undefined || blocked(grid.pointCover[point]!)) continue
      const state = point * 4 + port.outward
      visit(state, CLEARANCE_PX, -1 - port.outward)
      heap.push(CLEARANCE_PX + heuristic(point), state)
    }

    while (heap.size > 0) {
      const state = heap.pop()
      if (state >= doneBase) {
        doneState = state - doneBase
        break
      }
      const point = state >> 2
      const direction = state & 3
      const cost = costOf(state)
      const goal = goals.get(point)
      if (goal && direction !== goal.outward) {
        const finish = cost + CLEARANCE_PX + (direction === opposite(goal.outward) ? 0 : BEND_COST_PX)
        if (finish < doneCost) {
          doneCost = finish
          heap.push(finish, doneBase + state)
        }
      }
      const xi = point % columns
      const yi = Math.floor(point / columns)
      for (let next = 0; next < 4; next++) {
        if (next === opposite(direction)) continue
        const nx = xi + STEP_X[next]!
        const ny = yi + STEP_Y[next]!
        if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue
        const nextPoint = ny * columns + nx
        const horizontal = next === RIGHT || next === LEFT
        const from = next === RIGHT || next === DOWN ? point : nextPoint
        const segmentCover = horizontal ? grid.rightCover[from]! : grid.downCover[from]!
        if (blocked(segmentCover) || blocked(grid.pointCover[nextPoint]!)) continue
        if (inEnd((xs[xi]! + xs[nx]!) / 2, (ys[yi]! + ys[ny]!) / 2) || inEnd(xs[nx]!, ys[ny]!)) continue
        const length = Math.abs(xs[nx]! - xs[xi]!) + Math.abs(ys[ny]! - ys[yi]!)
        const onChannel = horizontal ? grid.yChannel[yi] === 1 : grid.xChannel[xi] === 1
        const factor = 1 + usage[from * 2 + (horizontal ? 0 : 1)]! * REUSE_COST + (onChannel ? 0 : EDGE_TRACK_COST)
        const nextCost = cost + length * factor + (next === direction ? 0 : BEND_COST_PX)
        const nextState = nextPoint * 4 + next
        if (nextCost >= costOf(nextState)) continue
        visit(nextState, nextCost, state)
        heap.push(nextCost + heuristic(nextPoint), nextState)
      }
    }
    if (doneState < 0) return null

    const cells: number[] = []
    let cursor = doneState
    let startDirection = RIGHT
    for (;;) {
      cells.push(cursor >> 2)
      const before = previous[cursor]!
      if (before < 0) {
        startDirection = -1 - before
        break
      }
      cursor = before
    }
    cells.reverse()
    for (let index = 1; index < cells.length; index++) {
      const a = cells[index - 1]!
      const b = cells[index]!
      const horizontal = Math.floor(a / columns) === Math.floor(b / columns)
      const segment = Math.min(a, b) * 2 + (horizontal ? 0 : 1)
      usage[segment] = usage[segment]! + 1
    }
    const start = portsOf(source).find((port) => port.outward === startDirection)!
    return simplify([start.point, ...cells.map(grid.pointAt), goals.get(doneState >> 2)!.point])
  }
}

interface RoutedEdge {
  points: XY[]
  source: number
  target: number
}

/**
 * Routes edges at right angles around the nodes between their ends.
 *
 * A route starts and ends on a node side. It never passes through a node that is not one of its ends. It passes
 * through a group only when the group holds one of its ends. Parallel routes that share a channel move apart.
 *
 * @returns The route of each edge from the source border to the target border. An edge without a possible route
 * has no entry.
 */
export function routeEdges(nodes: readonly RouterNode[], edges: readonly RouterEdge[]): Map<string, XY[]> {
  const indexOf = new Map(nodes.map((node, index) => [node.id, index]))
  const ancestors = nodes.map((node) => {
    const chain: number[] = []
    for (let parent = node.parentId; parent !== undefined && indexOf.has(parent);) {
      const index = indexOf.get(parent)!
      if (chain.includes(index)) break
      chain.push(index)
      parent = nodes[index]!.parentId
    }
    return chain
  })
  const route = createSearch(buildGrid(nodes, new Set(edges.flatMap((edge) => [edge.source, edge.target]))))
  const open = new Uint8Array(nodes.length)
  const routed = new Map<string, RoutedEdge>()

  const ordered = edges
    .filter((edge) => indexOf.has(edge.source) && indexOf.has(edge.target) && edge.source !== edge.target)
    .map((edge) => {
      const a = nodes[indexOf.get(edge.source)!]!.rect
      const b = nodes[indexOf.get(edge.target)!]!.rect
      const distance =
        Math.abs(a.x + a.width / 2 - b.x - b.width / 2) + Math.abs(a.y + a.height / 2 - b.y - b.height / 2)
      return { edge, distance }
    })
    .toSorted((a, b) => a.distance - b.distance)

  for (const { edge } of ordered) {
    const source = indexOf.get(edge.source)!
    const target = indexOf.get(edge.target)!
    open.fill(0)
    for (const index of [source, target, ...ancestors[source]!, ...ancestors[target]!]) open[index] = 1
    const points = route(nodes[source]!.rect, nodes[target]!.rect, open)
    if (points) routed.set(edge.id, { points, source, target })
  }

  nudge(routed, nodes, ancestors, 'vertical')
  nudge(routed, nodes, ancestors, 'horizontal')
  return new Map(
    [...routed].map(([id, { points }]) => [
      id,
      simplify(points).map((point) => ({ x: roundHalf(point.x), y: roundHalf(point.y) })),
    ]),
  )
}

interface Segment {
  route: XY[]
  owner: RoutedEdge
  /** The index of the first point of the segment in its route. */
  index: number
  /** The coordinate of the line, x for a vertical segment and y for a horizontal one. */
  at: number
  low: number
  high: number
  /** The side of the line where the route continues at the low end, -1, 0 or 1. */
  lowSide: number
  /** The side of the line where the route continues at the high end, -1, 0 or 1. */
  highSide: number
}

/**
 * Moves parallel segments that overlap apart. Segments in one channel get an order with few crossings. Then they
 * spread around the channel line as far as the nodes next to the channel allow.
 */
function nudge(
  routed: Map<string, RoutedEdge>,
  nodes: readonly RouterNode[],
  ancestors: number[][],
  orientation: 'vertical' | 'horizontal',
) {
  const vertical = orientation === 'vertical'
  const along = (point: XY) => (vertical ? point.y : point.x)
  const across = (point: XY) => (vertical ? point.x : point.y)
  const segments: Segment[] = []
  for (const owner of routed.values()) {
    const route = owner.points
    for (let index = 0; index + 1 < route.length; index++) {
      const a = route[index]!
      const b = route[index + 1]!
      if (Math.abs(across(a) - across(b)) > 0.01) continue
      if (Math.abs(along(a) - along(b)) < 0.01) continue
      const before = route[index - 1]
      const after = route[index + 2]
      const sideOf = (neighbour: XY | undefined) =>
        neighbour ? Math.sign(Math.round(across(neighbour) - across(a))) : 0
      const forward = along(b) > along(a)
      const lowNeighbour = forward ? before : after
      const highNeighbour = forward ? after : before
      segments.push({
        route,
        owner,
        index,
        at: across(a),
        low: Math.min(along(a), along(b)),
        high: Math.max(along(a), along(b)),
        lowSide: sideOf(lowNeighbour),
        highSide: sideOf(highNeighbour),
      })
    }
  }

  const byLine = new Map<number, Segment[]>()
  for (const segment of segments) {
    const key = roundHalf(segment.at)
    let line = byLine.get(key)
    if (!line) byLine.set(key, (line = []))
    line.push(segment)
  }
  for (const lineSegments of byLine.values()) {
    lineSegments.sort((a, b) => a.low - b.low)
    let bundle: Segment[] = []
    let reach = -Infinity
    const flush = () => {
      if (new Set(bundle.map((segment) => segment.route)).size > 1) spread(bundle)
      bundle = []
    }
    for (const segment of lineSegments) {
      if (segment.low >= reach - 0.01) flush()
      bundle.push(segment)
      reach = Math.max(reach, segment.high)
    }
    flush()
  }

  function crossingsIfBefore(a: Segment, b: Segment) {
    let count = 0
    const within = (value: number, segment: Segment) => value > segment.low + 0.01 && value < segment.high - 0.01
    if (a.lowSide > 0 && within(a.low, b)) count++
    if (a.highSide > 0 && within(a.high, b)) count++
    if (b.lowSide < 0 && within(b.low, a)) count++
    if (b.highSide < 0 && within(b.high, a)) count++
    return count
  }

  function room(segment: Segment, sign: number) {
    const open = new Set([
      segment.owner.source,
      segment.owner.target,
      ...ancestors[segment.owner.source]!,
      ...ancestors[segment.owner.target]!,
    ])
    let limit = Infinity
    for (let index = 0; index < nodes.length; index++) {
      const rect = nodes[index]!.rect
      const low = vertical ? rect.y : rect.x
      const high = vertical ? rect.y + rect.height : rect.x + rect.width
      if (high <= segment.low || low >= segment.high) continue
      const near = vertical ? rect.x : rect.y
      const far = vertical ? rect.x + rect.width : rect.y + rect.height
      if (open.has(index) && !(index === segment.owner.source || index === segment.owner.target)) {
        if (sign > 0 && far > segment.at) limit = Math.min(limit, far - segment.at)
        if (sign < 0 && near < segment.at) limit = Math.min(limit, segment.at - near)
        continue
      }
      if (sign > 0 && near >= segment.at) limit = Math.min(limit, near - segment.at)
      if (sign < 0 && far <= segment.at) limit = Math.min(limit, segment.at - far)
    }
    return limit
  }

  function portLimits(segment: Segment): [number, number] | null {
    const last = segment.route.length - 2
    const ends: number[] = []
    if (segment.index === 0) ends.push(segment.owner.source)
    if (segment.index === last) ends.push(segment.owner.target)
    if (ends.length === 0) return null
    let low = -Infinity
    let high = Infinity
    for (const end of ends) {
      const rect = nodes[end]!.rect
      low = Math.max(low, (vertical ? rect.x : rect.y) + PORT_MARGIN_PX)
      high = Math.min(high, (vertical ? rect.x + rect.width : rect.y + rect.height) - PORT_MARGIN_PX)
    }
    return low <= high ? [low, high] : null
  }

  function spread(bundle: Segment[]) {
    const ordered: Segment[] = []
    for (const segment of bundle) {
      let position = ordered.length
      for (let index = 0; index < ordered.length; index++) {
        if (crossingsIfBefore(segment, ordered[index]!) < crossingsIfBefore(ordered[index]!, segment)) {
          position = index
          break
        }
      }
      ordered.splice(position, 0, segment)
    }
    const line = bundle[0]!.at
    const below = Math.min(...bundle.map((segment) => room(segment, -1))) - PORT_MARGIN_PX
    const above = Math.min(...bundle.map((segment) => room(segment, 1))) - PORT_MARGIN_PX
    const count = ordered.length
    const spacing = Math.max(2, Math.min(ROUTE_SPACING_PX, (below + above) / Math.max(1, count - 1)))
    const width = spacing * (count - 1)
    const first = Math.min(Math.max(line - width / 2, line - Math.max(0, below)), line + Math.max(0, above) - width)
    ordered.forEach((segment, index) => {
      let target = first + index * spacing
      const limits = portLimits(segment)
      if (limits) target = Math.min(Math.max(target, limits[0]), limits[1])
      const a = segment.route[segment.index]!
      const b = segment.route[segment.index + 1]!
      if (vertical) {
        a.x = target
        b.x = target
      } else {
        a.y = target
        b.y = target
      }
    })
  }
}
