import type { XY } from '@/model/schema'

export const LAYOUT_DIRECTIONS = ['RIGHT', 'DOWN', 'LEFT', 'UP'] as const
export type LayoutDirection = (typeof LAYOUT_DIRECTIONS)[number]

/** The Graphviz engines that a layout can use. */
export const GRAPHVIZ_ENGINES = ['dot', 'neato', 'fdp', 'circo', 'twopi', 'osage'] as const
export type GraphvizEngine = (typeof GRAPHVIZ_ENGINES)[number]

/** The arrangements of a layout. `flow` is the layered layout of Tidy up. */
export const LAYOUT_STYLES = ['flow', 'tree', 'hub', 'network', 'grid', 'lanes', ...GRAPHVIZ_ENGINES] as const
export type LayoutStyle = (typeof LAYOUT_STYLES)[number]

export function isGraphvizEngine(style: LayoutStyle): style is GraphvizEngine {
  return (GRAPHVIZ_ENGINES as readonly string[]).includes(style)
}

export interface LayoutNode {
  id: string
  parentId?: string
  width: number
  height: number
  /** The least width of a group that holds other nodes, so that its label shows completely. */
  minWidth: number
}

export interface LayoutEdge {
  id: string
  source: string
  target: string
}

export interface LayoutRequest {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  direction: LayoutDirection
  layerGapPx: number
  style: LayoutStyle
  /** The node at the centre of a `hub` layout. Without it, each level puts the node with the most edges there. */
  center?: string
}

export interface PlacedNode {
  id: string
  /** The position relative to the parent. */
  x: number
  y: number
  width: number
  height: number
}

export interface LayoutResponse {
  nodes: PlacedNode[]
  /** The route of each routed edge, in canvas coordinates. */
  routes: Record<string, XY[]>
}

/** Rounds a canvas coordinate to the nearest half pixel, the precision of routes. */
export function roundHalf(value: number) {
  return Math.round(value * 2) / 2
}
