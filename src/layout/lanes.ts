import { GROUP_PADDING_PX } from '@/model/graph'
import { childUnder, type LayoutTree } from './tree'
import type { LayoutRequest, PlacedNode } from './types'

/** The space between two lanes, in canvas pixels. */
const LANE_GAP_PX = 32
/** The space between two boxes in the same column of a lane, in canvas pixels. */
const STACK_GAP_PX = 40

interface Unit {
  id: string
  /** The lane group that holds the unit, or null for a node outside every group. */
  lane: string | null
  along: number
  across: number
}

/** Returns the column of each unit: the longest path to it, with edges against the unit order left out in cycles. */
export function laneColumns(units: readonly string[], links: readonly [string, string][]): Map<string, number> {
  const outgoing = new Map(units.map((id) => [id, [] as string[]]))
  const waiting = new Map(units.map((id) => [id, 0]))
  const unique = [...new Set(links.map(([a, b]) => `${a}\u0000${b}`))].map((key) => key.split('\u0000'))
  for (const [source, target] of unique as [string, string][]) {
    outgoing.get(source)!.push(target)
    waiting.set(target, waiting.get(target)! + 1)
  }
  const column = new Map(units.map((id) => [id, 0]))
  const done = new Set<string>()
  const queue = units.filter((id) => waiting.get(id) === 0)
  while (done.size < units.length) {
    if (queue.length === 0) queue.push(units.find((id) => !done.has(id))!)
    const current = queue.shift()!
    if (done.has(current)) continue
    done.add(current)
    for (const next of outgoing.get(current)!) {
      if (done.has(next)) continue
      column.set(next, Math.max(column.get(next)!, column.get(current)! + 1))
      waiting.set(next, waiting.get(next)! - 1)
      if (waiting.get(next) === 0) queue.push(next)
    }
  }
  return column
}

/**
 * Arranges the top-level groups as lanes. Each box in a lane gets a column from the edges, the columns line up across
 * all lanes, and all lanes get the same length. Top-level nodes outside every group get a band before the first lane.
 * The direction runs along the lanes; with RIGHT or LEFT the lanes are rows, with DOWN or UP they are columns.
 *
 * @param placed - A flow layout of the whole request, which gives the sizes and the inside of each box.
 * @returns The nodes with new positions for the lanes and their boxes, and new sizes for the lanes.
 */
export function laneLayout(request: LayoutRequest, tree: LayoutTree, placed: readonly PlacedNode[]): PlacedNode[] {
  const byId = new Map(placed.map((node) => [node.id, node]))
  const rows = request.direction === 'RIGHT' || request.direction === 'LEFT'
  const reversed = request.direction === 'LEFT' || request.direction === 'UP'
  const lanes = (tree.children.get(null) ?? []).filter((id) => tree.isContainer(id))
  const laneSet = new Set(lanes)
  const unitOf = (id: string) => {
    const top = childUnder(tree, null, id)
    return top !== null && laneSet.has(top) ? childUnder(tree, top, id) : top
  }
  const unit = (id: string, lane: string | null): Unit => {
    const node = byId.get(id)!
    return {
      id,
      lane,
      along: rows ? node.width : node.height,
      across: rows ? node.height : node.width,
    }
  }
  const units = [
    ...(tree.children.get(null) ?? []).filter((id) => !laneSet.has(id)).map((id) => unit(id, null)),
    ...lanes.flatMap((lane) => (tree.children.get(lane) ?? []).map((id) => unit(id, lane))),
  ]
  const links = request.edges.flatMap((edge): [string, string][] => {
    const source = unitOf(edge.source)
    const target = unitOf(edge.target)
    return source !== null && target !== null && source !== target ? [[source, target]] : []
  })
  const columns = laneColumns(
    units.map((item) => item.id),
    links,
  )
  const last = Math.max(0, ...columns.values())
  const columnOf = (id: string) => (reversed ? last - columns.get(id)! : columns.get(id)!)

  const columnSize = Array.from({ length: last + 1 }, () => 0)
  for (const item of units) columnSize[columnOf(item.id)] = Math.max(columnSize[columnOf(item.id)]!, item.along)
  const columnStart: number[] = []
  let length = 0
  columnSize.forEach((size, index) => {
    columnStart.push(length)
    length += size + (index < last ? request.layerGapPx : 0)
  })

  const padding = rows
    ? {
        alongStart: GROUP_PADDING_PX.side,
        alongEnd: GROUP_PADDING_PX.side,
        acrossStart: GROUP_PADDING_PX.top,
        acrossEnd: GROUP_PADDING_PX.bottom,
      }
    : {
        alongStart: GROUP_PADDING_PX.top,
        alongEnd: GROUP_PADDING_PX.bottom,
        acrossStart: GROUP_PADDING_PX.side,
        acrossEnd: GROUP_PADDING_PX.side,
      }
  const minAlong = rows ? Math.max(0, ...lanes.map((lane) => tree.nodes.get(lane)!.minWidth)) : 0
  const laneAlong = Math.max(minAlong, padding.alongStart + length + padding.alongEnd)

  const result = new Map(placed.map((node) => [node.id, { ...node }]))
  const put = (id: string, along: number, across: number) => {
    const node = result.get(id)!
    node.x = rows ? along : across
    node.y = rows ? across : along
  }
  let acrossOffset = 0
  for (const lane of [null, ...lanes]) {
    const members = units.filter((item) => item.lane === lane)
    if (lane === null && members.length === 0) continue
    const stack = new Map<number, number>()
    const inset =
      lane === null
        ? { along: padding.alongStart, across: 0 }
        : { along: padding.alongStart, across: padding.acrossStart }
    for (const item of members) {
      const column = columnOf(item.id)
      const offset = stack.get(column) ?? 0
      const along = inset.along + columnStart[column]! + (columnSize[column]! - item.along) / 2
      put(item.id, along, (lane === null ? acrossOffset : 0) + inset.across + offset)
      stack.set(column, offset + item.across + STACK_GAP_PX)
    }
    const content = Math.max(0, ...stack.values()) - (members.length > 0 ? STACK_GAP_PX : 0)
    const across =
      lane === null
        ? content
        : Math.max(rows ? 0 : tree.nodes.get(lane)!.minWidth, padding.acrossStart + content + padding.acrossEnd)
    if (lane !== null) {
      const node = result.get(lane)!
      put(lane, 0, acrossOffset)
      node.width = rows ? laneAlong : across
      node.height = rows ? across : laneAlong
    }
    acrossOffset += across + LANE_GAP_PX
  }
  return [...result.values()]
}
