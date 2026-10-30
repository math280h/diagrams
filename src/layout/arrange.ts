import type { ELK, ElkExtendedEdge } from 'elkjs/lib/elk-api'
import { GROUP_PADDING_PX } from '@/model/graph'
import { unionRects, type Rect } from '@/model/rect'
import type { XY } from '@/model/schema'
import { LAYERED_OPTIONS, spacingOptions } from './hierarchy'
import { placeLevel } from './styles'
import { childUnder, lowestCommonContainer, type LayoutTree } from './tree'
import type { LayoutRequest, PlacedNode } from './types'

interface Box {
  id: string
  width: number
  height: number
  container: boolean
}

interface LevelEdge {
  source: string
  target: string
  count: number
}

type Positions = Map<string, XY>

function boxRects(boxes: readonly Box[], positions: Positions): Rect[] {
  return boxes.map((box) => ({ ...positions.get(box.id)!, width: box.width, height: box.height }))
}

interface Score {
  cost: number
  /** The width of the arrangement divided by its height. */
  aspect: number
  /** The width plus the height of the arrangement. */
  extentPx: number
}

/** A grid replaces the layers of a level only if its cost is below this share of the cost of the layers. */
const GRID_ADVANTAGE = 0.85
/** The cost of an edge that points against the layout direction, as extra edge length. */
const BACKWARD_EDGE_COST_PX = 600
/** The cost of an edge that runs across the layout direction, as extra edge length. */
const SIDEWAYS_EDGE_COST_PX = 200
/** The cost of two edges that cross, as extra edge length. */
const CROSSING_COST_PX = 150
/** The distance along the layout direction below which an edge counts as sideways. */
const SIDEWAYS_TOLERANCE_PX = 20
/** The width divided by the height that a grid aims for. */
const GRID_ASPECT = 1.6
const GRID_ASPECT_WEIGHT = 2
/** The largest natural logarithm of the ratio between the aspect of a grid and `GRID_ASPECT` that the search tries. */
const GRID_ASPECT_RANGE = 1.6
const MAX_SWAP_PASSES = 8
/** The largest number of boxes in a grid for which the search swaps cells. */
const MAX_SWAP_BOXES = 30
/** The largest number of edges for which the score counts crossings. */
const MAX_CROSSING_EDGES = 120

export interface Arrangement {
  nodes: PlacedNode[]
  /** True if at least one level is a grid instead of layers. */
  packed: boolean
}

function levelEdges(request: LayoutRequest, tree: LayoutTree, container: string | null): LevelEdge[] {
  const byPair = new Map<string, LevelEdge>()
  for (const edge of request.edges) {
    if (lowestCommonContainer(tree, edge.source, edge.target) !== container) continue
    const source = childUnder(tree, container, edge.source)
    const target = childUnder(tree, container, edge.target)
    if (source === null || target === null || source === target) continue
    const key = `${source}\u0000${target}`
    const entry = byPair.get(key) ?? { source, target, count: 0 }
    entry.count++
    byPair.set(key, entry)
  }
  return [...byPair.values()]
}

async function layeredPositions(
  elk: ELK,
  boxes: Box[],
  edges: LevelEdge[],
  request: LayoutRequest,
): Promise<Positions> {
  const result = await elk.layout({
    id: '__level',
    layoutOptions: {
      ...LAYERED_OPTIONS,
      ...spacingOptions(request.layerGapPx),
      'elk.direction': request.direction,
      'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
    },
    children: boxes.map((box) => ({ id: box.id, width: box.width, height: box.height })),
    edges: edges.flatMap((edge, index) =>
      Array.from({ length: edge.count }, (_, copy): ElkExtendedEdge => ({
        id: `${index}:${copy}`,
        sources: [edge.source],
        targets: [edge.target],
      })),
    ),
  })
  return new Map((result.children ?? []).map((child) => [child.id, { x: child.x ?? 0, y: child.y ?? 0 }]))
}

/** Returns the layer of each box by longest path. An edge against the box order does not count. */
function layersOf(boxes: Box[], edges: LevelEdge[]): Map<string, number> {
  const order = new Map(boxes.map((box, index) => [box.id, index]))
  const forward = edges.filter((edge) => order.get(edge.source)! < order.get(edge.target)!)
  const layer = new Map(boxes.map((box) => [box.id, 0]))
  for (const box of boxes) {
    for (const edge of forward) {
      if (edge.source === box.id) layer.set(edge.target, Math.max(layer.get(edge.target)!, layer.get(box.id)! + 1))
    }
  }
  return layer
}

function segmentsCross(a: readonly number[], b: readonly number[]) {
  const [ax, ay, bx, by] = a as [number, number, number, number]
  const [cx, cy, dx, dy] = b as [number, number, number, number]
  const denominator = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx)
  if (Math.abs(denominator) < 1e-9) return false
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / denominator
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / denominator
  return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98
}

/** An end of an edge at one level: the box that holds the end node, and the node rectangle relative to the box. */
interface LevelEnd {
  box: string
  rect: Rect
}

/**
 * Returns the ends of the edges between the real nodes of a level. The ends do not change between arrangements of the
 * level.
 */
function levelEnds(
  request: LayoutRequest,
  tree: LayoutTree,
  contents: Map<string | null, Map<string, Rect>>,
  container: string | null,
  boxes: Box[],
): [LevelEnd, LevelEnd][] {
  const boxById = new Map(boxes.map((box) => [box.id, box]))
  const endOf = (id: string): LevelEnd | null => {
    const child = childUnder(tree, container, id)
    if (child === null) return null
    if (child === id)
      return { box: id, rect: { x: 0, y: 0, width: boxById.get(id)!.width, height: boxById.get(id)!.height } }
    const inner = contents.get(child)?.get(id)
    if (!inner) return null
    return {
      box: child,
      rect: { ...inner, x: GROUP_PADDING_PX.side + inner.x, y: GROUP_PADDING_PX.top + inner.y },
    }
  }
  return request.edges.flatMap((edge): [LevelEnd, LevelEnd][] => {
    if (lowestCommonContainer(tree, edge.source, edge.target) !== container) return []
    const a = endOf(edge.source)
    const b = endOf(edge.target)
    return a && b ? [[a, b]] : []
  })
}

/**
 * Scores one arrangement of a level. The score is the sum of:
 *
 * - the lengths of the edges between the real nodes
 * - the costs of edges against or across the layout direction
 * - the costs of crossings
 * - the extent of the arrangement
 */
function scoreArrangement(
  request: LayoutRequest,
  ends: readonly [LevelEnd, LevelEnd][],
  boxes: Box[],
  positions: Positions,
): Score {
  const centre = ({ box, rect }: LevelEnd) => {
    const position = positions.get(box)!
    return { x: position.x + rect.x + rect.width / 2, y: position.y + rect.y + rect.height / 2 }
  }
  const vertical = request.direction === 'DOWN' || request.direction === 'UP'
  const forwardSign = request.direction === 'DOWN' || request.direction === 'RIGHT' ? 1 : -1
  let cost = 0
  const lines: number[][] = []
  for (const [source, target] of ends) {
    const { x: ax, y: ay } = centre(source)
    const { x: bx, y: by } = centre(target)
    cost += Math.abs(ax - bx) + Math.abs(ay - by)
    const ahead = (vertical ? by - ay : bx - ax) * forwardSign
    if (ahead < -SIDEWAYS_TOLERANCE_PX) cost += BACKWARD_EDGE_COST_PX
    else if (ahead < SIDEWAYS_TOLERANCE_PX) cost += SIDEWAYS_EDGE_COST_PX
    lines.push([ax, ay, bx, by])
  }
  if (lines.length <= MAX_CROSSING_EDGES) {
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) if (segmentsCross(lines[i]!, lines[j]!)) cost += CROSSING_COST_PX
    }
  }
  const bounds = unionRects(boxRects(boxes, positions))!
  const extentPx = bounds.width + bounds.height
  return { cost: cost + extentPx, aspect: bounds.width / Math.max(1, bounds.height), extentPx }
}

/**
 * Arranges boxes in a band of sources and then a grid. Sources are nodes that no edge at this level goes to,
 * such as a gateway.
 */
function gridPositions(
  boxes: Box[],
  edges: LevelEdge[],
  request: LayoutRequest,
  score: (positions: Positions) => Score,
): Positions {
  const vertical = request.direction === 'DOWN' || request.direction === 'UP'
  const mirrored = request.direction === 'UP' || request.direction === 'LEFT'
  const gapPx = request.layerGapPx
  const incoming = new Set(edges.map((edge) => edge.target))
  const outgoing = new Set(edges.map((edge) => edge.source))
  const band = boxes.filter((box) => !box.container && !incoming.has(box.id) && outgoing.has(box.id))
  const layer = layersOf(boxes, edges)
  const cellBoxes = boxes
    .filter((box) => !band.includes(box))
    .toSorted((a, b) => layer.get(a.id)! - layer.get(b.id)! || boxes.indexOf(a) - boxes.indexOf(b))
  const main = (box: Box) => (vertical ? box.height : box.width)
  const cross = (box: Box) => (vertical ? box.width : box.height)

  const place = (cells: (Box | null)[], columns: number): Positions => {
    const rows = Math.ceil(cells.length / columns)
    const columnSize = Array<number>(columns).fill(0)
    const rowSize = Array<number>(rows).fill(0)
    cells.forEach((box, index) => {
      if (!box) return
      const column = index % columns
      const row = Math.floor(index / columns)
      columnSize[column] = Math.max(columnSize[column]!, cross(box))
      rowSize[row] = Math.max(rowSize[row]!, main(box))
    })
    const columnStart: number[] = []
    let at = 0
    for (const size of columnSize) {
      columnStart.push(at)
      if (size > 0) at += size + gapPx
    }
    const gridCross = Math.max(0, at - gapPx)
    const bandMain = band.length > 0 ? Math.max(...band.map(main)) + gapPx : 0
    const rowStart: number[] = []
    at = bandMain
    for (const size of rowSize) {
      rowStart.push(at)
      if (size > 0) at += size + gapPx
    }
    const totalMain = Math.max(0, at - gapPx)
    const positions: Positions = new Map()
    const put = (box: Box, along: number, side: number) => {
      const flipped = mirrored ? totalMain - along - main(box) : along
      positions.set(box.id, vertical ? { x: side, y: flipped } : { x: flipped, y: side })
    }
    cells.forEach((box, index) => {
      if (!box) return
      const column = index % columns
      put(box, rowStart[Math.floor(index / columns)]!, columnStart[column]! + (columnSize[column]! - cross(box)) / 2)
    })
    const bandCross = band.reduce((sum, box) => sum + cross(box), 0) + gapPx * Math.max(0, band.length - 1)
    let cursor = Math.max(0, (gridCross - bandCross) / 2)
    for (const box of band) {
      put(box, 0, cursor)
      cursor += cross(box) + gapPx
    }
    return positions
  }

  const shaped = (positions: Positions) => {
    const result = score(positions)
    return result.cost + result.extentPx * GRID_ASPECT_WEIGHT * Math.abs(Math.log(result.aspect / GRID_ASPECT))
  }
  const count = cellBoxes.length
  const startCells = (columns: number): (Box | null)[] => [
    ...cellBoxes,
    ...Array<null>(Math.ceil(count / columns) * columns - count).fill(null),
  ]
  const shapes: { columns: number; distance: number }[] = []
  for (let columns = 1; columns <= Math.max(1, count); columns++) {
    if (columns > 1 && (columns - 1) * Math.ceil(count / columns) >= count) continue
    const aspect = score(place(startCells(columns), columns)).aspect
    shapes.push({ columns, distance: Math.abs(Math.log(aspect / GRID_ASPECT)) })
  }
  const nearest = Math.min(...shapes.map((shape) => shape.distance))
  const tried = shapes.filter((shape) => shape.distance <= Math.max(GRID_ASPECT_RANGE, nearest))

  const swapPasses = count <= MAX_SWAP_BOXES ? MAX_SWAP_PASSES : 0
  let best: { cost: number; positions: Positions } | null = null
  for (const { columns } of tried) {
    let cells = startCells(columns)
    let cost = score(place(cells, columns)).cost
    for (let pass = 0; pass < swapPasses; pass++) {
      let improved = false
      for (let a = 0; a < cells.length; a++) {
        for (let b = a + 1; b < cells.length; b++) {
          if (!cells[a] && !cells[b]) continue
          const next = [...cells]
          ;[next[a], next[b]] = [next[b]!, next[a]!]
          const nextCost = score(place(next, columns)).cost
          if (nextCost < cost - 1) {
            cells = next
            cost = nextCost
            improved = true
          }
        }
      }
      if (!improved) break
    }
    const positions = place(cells, columns)
    const total = shaped(positions)
    if (!best || total < best.cost) best = { cost: total, positions }
  }
  return best!.positions
}

/**
 * Lays out each container on its own, from the deepest up. With the flow style, a level with two or more groups becomes
 * a grid when the grid scores clearly better than layers. The other styles place each level with {@link placeLevel}.
 * The returned positions are relative to the parent of each node.
 */
export async function arrangeLevels(elk: ELK, request: LayoutRequest, tree: LayoutTree): Promise<Arrangement> {
  const sizes = new Map<string, { width: number; height: number }>()
  const local = new Map<string, XY>()
  const contents = new Map<string | null, Map<string, Rect>>()
  let packed = false
  const sizeOf = (id: string) => {
    const node = tree.nodes.get(id)!
    return sizes.get(id) ?? { width: node.width, height: node.height }
  }

  const arrange = async (container: string | null) => {
    const kids = tree.children.get(container) ?? []
    for (const kid of kids) if (tree.isContainer(kid)) await arrange(kid)
    const boxes = kids.map((id): Box => ({ id, ...sizeOf(id), container: tree.isContainer(id) }))
    const edges = levelEdges(request, tree, container)
    const style = request.style
    let positions =
      style === 'flow'
        ? await layeredPositions(elk, boxes, edges, request)
        : await placeLevel(
            elk,
            style,
            boxes,
            edges,
            request,
            request.center ? childUnder(tree, container, request.center) : null,
          )
    if (style === 'flow' && boxes.filter((box) => box.container).length >= 2) {
      const ends = levelEnds(request, tree, contents, container, boxes)
      const score = (candidate: Positions) => scoreArrangement(request, ends, boxes, candidate)
      const grid = gridPositions(boxes, edges, request, score)
      if (score(grid).cost < score(positions).cost * GRID_ADVANTAGE) {
        positions = grid
        packed = true
      }
    }
    const { x: minX, y: minY } = unionRects(boxRects(boxes, positions))!
    const rects = new Map<string, Rect>()
    let width = 0
    let height = 0
    for (const box of boxes) {
      const position = { x: positions.get(box.id)!.x - minX, y: positions.get(box.id)!.y - minY }
      local.set(box.id, position)
      rects.set(box.id, { ...position, width: box.width, height: box.height })
      width = Math.max(width, position.x + box.width)
      height = Math.max(height, position.y + box.height)
      for (const [id, rect] of contents.get(box.id) ?? []) {
        rects.set(id, {
          x: position.x + GROUP_PADDING_PX.side + rect.x,
          y: position.y + GROUP_PADDING_PX.top + rect.y,
          width: rect.width,
          height: rect.height,
        })
      }
    }
    contents.set(container, rects)
    if (container !== null) {
      sizes.set(container, {
        width: Math.max(tree.nodes.get(container)!.minWidth, width + GROUP_PADDING_PX.side + GROUP_PADDING_PX.side),
        height: height + GROUP_PADDING_PX.top + GROUP_PADDING_PX.bottom,
      })
    }
  }
  await arrange(null)

  const nodes = [...tree.nodes.values()].map((node): PlacedNode => {
    const position = local.get(node.id) ?? { x: 0, y: 0 }
    const inGroup = tree.parentOf(node.id) !== null
    return {
      id: node.id,
      x: position.x + (inGroup ? GROUP_PADDING_PX.side : 0),
      y: position.y + (inGroup ? GROUP_PADDING_PX.top : 0),
      ...sizeOf(node.id),
    }
  })
  return { nodes, packed }
}
