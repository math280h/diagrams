import type { ELK, ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api'
import { GROUP_PADDING_PX } from '@/model/graph'
import type { XY } from '@/model/schema'
import type { LayoutTree } from './tree'
import { roundHalf, type LayoutDirection, type LayoutRequest, type LayoutResponse, type PlacedNode } from './types'

/** Returns spacing options for the root and for each group. ELK reads spacing from the parent of each node. */
export function spacingOptions(layerGapPx: number) {
  return {
    'elk.layered.spacing.nodeNodeBetweenLayers': String(layerGapPx),
    'elk.spacing.nodeNode': '40',
    'elk.spacing.edgeNode': '24',
    'elk.spacing.edgeEdge': '14',
    'elk.layered.spacing.edgeEdgeBetweenLayers': '14',
    'elk.layered.spacing.edgeNodeBetweenLayers': '24',
  }
}

export const LAYERED_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.layered.crossingMinimization.forceNodeModelOrder': 'false',
}

const ELK_GROUP_PADDING = `[top=${GROUP_PADDING_PX.top},left=${GROUP_PADDING_PX.side},bottom=${GROUP_PADDING_PX.bottom},right=${GROUP_PADDING_PX.side}]`

function groupOptions(minWidth: number, direction: LayoutDirection, layerGapPx: number) {
  return {
    ...spacingOptions(layerGapPx),
    'elk.direction': direction,
    'elk.padding': ELK_GROUP_PADDING,
    'elk.nodeSize.constraints': 'MINIMUM_SIZE',
    'elk.nodeSize.minimum': `(${minWidth}, 0)`,
  }
}

/** Returns the points of an ELK edge from start to end, or `undefined` if ELK gave no route. */
function routeOf(edge: ElkExtendedEdge): XY[] | undefined {
  const points: XY[] = []
  for (const section of edge.sections ?? []) {
    for (const point of [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]) {
      const rounded = { x: roundHalf(point.x), y: roundHalf(point.y) }
      const previous = points.at(-1)
      if (!previous || previous.x !== rounded.x || previous.y !== rounded.y) points.push(rounded)
    }
  }
  return points.length >= 2 ? points : undefined
}

/** Lays out the whole hierarchy in one ELK layered run, with orthogonal routes for all edges. */
export async function layoutHierarchy(elk: ELK, request: LayoutRequest, tree: LayoutTree): Promise<LayoutResponse> {
  const elkNodes = new Map<string, ElkNode>()
  for (const node of request.nodes) {
    elkNodes.set(node.id, {
      id: node.id,
      ...(tree.isContainer(node.id)
        ? { layoutOptions: groupOptions(node.minWidth, request.direction, request.layerGapPx) }
        : { width: node.width, height: node.height }),
      children: [],
    })
  }
  const root: ElkNode = {
    id: '__root',
    layoutOptions: {
      ...LAYERED_OPTIONS,
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.json.edgeCoords': 'ROOT',
      ...spacingOptions(request.layerGapPx),
      'elk.direction': request.direction,
    },
    children: [],
    edges: request.edges.map((edge): ElkExtendedEdge => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  }
  for (const node of request.nodes) {
    const parent = tree.parentOf(node.id)
    ;(parent === null ? root : elkNodes.get(parent)!).children!.push(elkNodes.get(node.id)!)
  }
  for (const elkNode of elkNodes.values()) {
    if (elkNode.children?.length === 0) delete elkNode.children
  }

  const result = await elk.layout(root)
  const nodes: PlacedNode[] = []
  const visit = (node: ElkNode) => {
    for (const child of node.children ?? []) {
      nodes.push({ id: child.id, x: child.x ?? 0, y: child.y ?? 0, width: child.width ?? 0, height: child.height ?? 0 })
      visit(child)
    }
  }
  visit(result)
  const routes: Record<string, XY[]> = {}
  for (const edge of result.edges ?? []) {
    const route = routeOf(edge)
    if (route) routes[edge.id] = route
  }
  return { nodes, routes }
}
