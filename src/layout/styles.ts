import type { ELK, ElkExtendedEdge, LayoutOptions } from 'elkjs/lib/elk-api'
import type { XY } from '@/model/schema'
import { graphvizPositions, type GraphvizRunner } from './graphviz'
import { isGraphvizEngine, type LayoutRequest, type LayoutStyle } from './types'

export interface LevelBox {
  id: string
  width: number
  height: number
}

export interface LevelLink {
  source: string
  target: string
}

/** The space between two boxes of one level in the layouts other than flow. */
const BOX_GAP_PX = 64
/** The most boxes in one level that the network layout arranges. A larger level gets the grid layout. */
export const NETWORK_MAX_BOXES = 80
/** The width divided by the height that the grid layout aims for. */
const GRID_ASPECT = 1.6

function treeOptions(request: LayoutRequest): LayoutOptions {
  return {
    'elk.algorithm': 'mrtree',
    'elk.direction': request.direction,
    'elk.spacing.nodeNode': String(Math.max(BOX_GAP_PX, request.layerGapPx / 2)),
  }
}

const HUB_OPTIONS: LayoutOptions = {
  'elk.algorithm': 'radial',
  'elk.radial.compactor': 'WEDGE_COMPACTION',
  'elk.spacing.nodeNode': String(BOX_GAP_PX),
}

function networkOptions(request: LayoutRequest): LayoutOptions {
  return {
    'elk.algorithm': 'sporeOverlap',
    'elk.underlyingLayoutAlgorithm': 'stress',
    'elk.stress.desiredEdgeLength': String(request.layerGapPx),
    'elk.spacing.nodeNode': String(BOX_GAP_PX),
  }
}

const GRID_OPTIONS: LayoutOptions = {
  'elk.algorithm': 'rectpacking',
  'elk.aspectRatio': String(GRID_ASPECT),
  'elk.spacing.nodeNode': String(BOX_GAP_PX),
}

/**
 * Returns the links of a tree that grows out from the hub of a level. The hub is `center` if it is in the level, else
 * the box with the most links. Each box that no link reaches gets a link from the hub.
 */
export function hubTree(boxes: readonly LevelBox[], links: readonly LevelLink[], center: string | null): LevelLink[] {
  const neighbours = new Map(boxes.map((box) => [box.id, new Set<string>()]))
  for (const { source, target } of links) {
    neighbours.get(source)?.add(target)
    neighbours.get(target)?.add(source)
  }
  const hub =
    center !== null && neighbours.has(center)
      ? center
      : boxes.reduce((best, box) => (neighbours.get(box.id)!.size > neighbours.get(best.id)!.size ? box : best)).id
  const tree: LevelLink[] = []
  const reached = new Set([hub])
  const queue = [hub]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const next of neighbours.get(current)!) {
      if (reached.has(next)) continue
      reached.add(next)
      tree.push({ source: current, target: next })
      queue.push(next)
    }
  }
  for (const box of boxes) if (!reached.has(box.id)) tree.push({ source: hub, target: box.id })
  return tree
}

async function runElk(
  elk: ELK,
  options: LayoutOptions,
  boxes: readonly LevelBox[],
  links: readonly LevelLink[],
): Promise<Map<string, XY>> {
  if (boxes.length <= 1) return new Map(boxes.map((box) => [box.id, { x: 0, y: 0 }]))
  const result = await elk.layout({
    id: '__level',
    layoutOptions: options,
    children: boxes.map((box) => ({ id: box.id, width: box.width, height: box.height })),
    edges: links.map((link, index): ElkExtendedEdge => ({
      id: `l${index}`,
      sources: [link.source],
      targets: [link.target],
    })),
  })
  return new Map((result.children ?? []).map((child) => [child.id, { x: child.x ?? 0, y: child.y ?? 0 }]))
}

/**
 * Places the boxes of one level with a layout other than flow. The positions can start anywhere; the caller moves them
 * to the origin. Edges are not routed here.
 *
 * @param center - The box of the level that holds the centre node of a hub layout, or null.
 * @param graphviz - Runs Graphviz for the Graphviz styles.
 */
export async function placeLevel(
  elk: ELK,
  style: Exclude<LayoutStyle, 'flow' | 'lanes'>,
  boxes: readonly LevelBox[],
  links: readonly LevelLink[],
  request: LayoutRequest,
  center: string | null,
  graphviz: GraphvizRunner,
): Promise<Map<string, XY>> {
  if (isGraphvizEngine(style)) return graphvizPositions(style, boxes, links, request, center, graphviz)
  if (style === 'tree') return runElk(elk, treeOptions(request), boxes, links)
  // ELK radial accepts only a tree with edges that point away from its root.
  if (style === 'hub') return runElk(elk, HUB_OPTIONS, boxes, hubTree(boxes, links, center))
  if (style === 'network' && boxes.length <= NETWORK_MAX_BOXES)
    return runElk(elk, networkOptions(request), boxes, links)
  return runElk(elk, GRID_OPTIONS, boxes, [])
}
