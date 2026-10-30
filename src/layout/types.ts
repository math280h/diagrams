export const LAYOUT_DIRECTIONS = ['RIGHT', 'DOWN', 'LEFT', 'UP'] as const
export type LayoutDirection = (typeof LAYOUT_DIRECTIONS)[number]

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
}

/** Rounds a canvas coordinate to the nearest half pixel, the precision of routes. */
export function roundHalf(value: number) {
  return Math.round(value * 2) / 2
}
