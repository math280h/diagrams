import type { XY } from '@/model/schema'

export const LAYOUT_DIRECTIONS = ['right', 'down', 'left', 'up'] as const
export type LayoutDirection = (typeof LAYOUT_DIRECTIONS)[number]

/** The value of the ELK option `elk.direction` for each layout direction. */
export const ELK_DIRECTIONS = { right: 'RIGHT', down: 'DOWN', left: 'LEFT', up: 'UP' } as const satisfies Record<
  LayoutDirection,
  string
>

export function isLayoutDirection(value: string): value is LayoutDirection {
  return (LAYOUT_DIRECTIONS as readonly string[]).includes(value)
}

/** The Graphviz engines that a layout can use. */
export const GRAPHVIZ_ENGINES = ['dot', 'neato', 'fdp', 'circo', 'twopi', 'osage'] as const
export type GraphvizEngine = (typeof GRAPHVIZ_ENGINES)[number]

/** The Graphviz engine of each layout style that Graphviz arranges. */
export const GRAPHVIZ_STYLE_ENGINES = {
  'graphviz-layers': 'dot',
  'graphviz-spring': 'neato',
  'graphviz-force': 'fdp',
  'graphviz-circle': 'circo',
  'graphviz-radial': 'twopi',
  'graphviz-packed': 'osage',
} as const satisfies Record<string, GraphvizEngine>
export type GraphvizStyle = keyof typeof GRAPHVIZ_STYLE_ENGINES
const GRAPHVIZ_STYLES = Object.keys(GRAPHVIZ_STYLE_ENGINES) as GraphvizStyle[]

/** The arrangements of a layout. `flow` is the layered layout of Tidy up. */
export const LAYOUT_STYLES = ['flow', 'tree', 'hub', 'network', 'grid', 'lanes', ...GRAPHVIZ_STYLES] as const
export type LayoutStyle = (typeof LAYOUT_STYLES)[number]

export function isGraphvizStyle(style: LayoutStyle): style is GraphvizStyle {
  return Object.hasOwn(GRAPHVIZ_STYLE_ENGINES, style)
}

export function graphvizStyleOfEngine(name: string): GraphvizStyle | undefined {
  return GRAPHVIZ_STYLES.find((style) => GRAPHVIZ_STYLE_ENGINES[style] === name)
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
