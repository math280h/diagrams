import type { Graphviz } from '@hpcc-js/wasm-graphviz'
import type { XY } from '@/model/schema'
import type { GraphvizEngine, LayoutDirection, LayoutRequest } from './types'

interface Box {
  id: string
  width: number
  height: number
}

interface Link {
  source: string
  target: string
}

// Graphviz measures in inches at 72 points; one canvas pixel is one point.
const POINTS_PER_INCH = 72
/** The space between two boxes of one level, in canvas pixels. */
const BOX_GAP_PX = 64

const RANK_DIRECTIONS: Record<LayoutDirection, string> = { RIGHT: 'LR', DOWN: 'TB', LEFT: 'RL', UP: 'BT' }

let loaded: Promise<Graphviz> | null = null

function graphviz(): Promise<Graphviz> {
  loaded ??= import('@hpcc-js/wasm-graphviz').then(({ Graphviz }) => Graphviz.load())
  return loaded
}

const inches = (px: number) => (px / POINTS_PER_INCH).toFixed(4)

function attributes(engine: GraphvizEngine, request: LayoutRequest, root: string | null) {
  const gap = inches(BOX_GAP_PX)
  const edgeLength = inches(request.layerGapPx + BOX_GAP_PX)
  switch (engine) {
    case 'dot':
      return {
        graph: [
          `rankdir=${RANK_DIRECTIONS[request.direction]}`,
          `nodesep=${gap}`,
          `ranksep=${inches(request.layerGapPx)}`,
        ],
        edge: [],
      }
    case 'neato':
      return { graph: ['start=1', 'overlap=false', `sep="+${BOX_GAP_PX / 2}"`], edge: [`len=${edgeLength}`] }
    case 'fdp':
      return { graph: ['start=1', 'overlap=false', `sep="+${BOX_GAP_PX / 2}"`, `K=${edgeLength}`], edge: [] }
    case 'circo':
      return { graph: [`mindist=${gap}`], edge: [] }
    case 'twopi':
      return {
        graph: ['overlap=false', `ranksep=${edgeLength}`, ...(root ? [`root="${root}"`] : [])],
        edge: [],
      }
    case 'osage':
      return { graph: [`sep=${BOX_GAP_PX / 2}`], edge: [] }
  }
}

/** Returns the DOT text of one level, with node names n0, n1 and so on in the order of `boxes`. */
export function levelDot(
  engine: GraphvizEngine,
  boxes: readonly Box[],
  links: readonly Link[],
  request: LayoutRequest,
  center: string | null,
): string {
  const names = new Map(boxes.map((box, index) => [box.id, `n${index}`]))
  const root = engine === 'twopi' ? (names.get(center ?? '') ?? names.get(busiest(boxes, links)) ?? null) : null
  const { graph, edge } = attributes(engine, request, root)
  return [
    'digraph level {',
    `  graph [${graph.join(', ')}];`,
    '  node [shape=box, fixedsize=true, label=""];',
    ...(edge.length > 0 ? [`  edge [${edge.join(', ')}];`] : []),
    ...boxes.map((box) => `  ${names.get(box.id)} [width=${inches(box.width)}, height=${inches(box.height)}];`),
    ...links.map((link) => `  ${names.get(link.source)} -> ${names.get(link.target)};`),
    '}',
  ].join('\n')
}

function busiest(boxes: readonly Box[], links: readonly Link[]): string {
  const degree = new Map(boxes.map((box) => [box.id, 0]))
  for (const { source, target } of links) {
    degree.set(source, (degree.get(source) ?? 0) + 1)
    degree.set(target, (degree.get(target) ?? 0) + 1)
  }
  return boxes.reduce((best, box) => (degree.get(box.id)! > degree.get(best.id)! ? box : best)).id
}

/** Reads the top-left corner of each node from Graphviz `plain` output, with y down. */
export function plainPositions(plain: string, boxes: readonly Box[]): Map<string, XY> {
  const centres = new Map<string, XY>()
  for (const line of plain.split('\n')) {
    const [kind, name, x, y] = line.trim().split(/\s+/)
    if (kind === 'node' && name !== undefined) centres.set(name, { x: Number(x), y: Number(y) })
  }
  return new Map(
    boxes.map((box, index) => {
      const centre = centres.get(`n${index}`) ?? { x: 0, y: 0 }
      return [
        box.id,
        {
          x: centre.x * POINTS_PER_INCH - box.width / 2,
          y: -centre.y * POINTS_PER_INCH - box.height / 2,
        },
      ]
    }),
  )
}

/**
 * Places the boxes of one level with a Graphviz engine. The positions can start anywhere; the caller moves them to the
 * origin. Edges are not routed here.
 *
 * @param center - The box of the level that holds the root of a `twopi` layout, or null.
 */
export async function graphvizPositions(
  engine: GraphvizEngine,
  boxes: readonly Box[],
  links: readonly Link[],
  request: LayoutRequest,
  center: string | null,
): Promise<Map<string, XY>> {
  if (boxes.length <= 1) return new Map(boxes.map((box) => [box.id, { x: 0, y: 0 }]))
  const plain = (await graphviz()).layout(levelDot(engine, boxes, links, request, center), 'plain', engine)
  return plainPositions(plain, boxes)
}
