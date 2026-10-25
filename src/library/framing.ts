import { unionRects, type Rect, type ViewSize, type Viewport } from '@/engine/camera'
import { rectCenter } from '@/model/rect'

export interface ReadableFraming {
  bounds: Rect
  /** The rectangles of the cards and shapes, by node id. */
  rects: ReadonlyMap<string, Rect>
  edges: readonly { source: string; target: string }[]
  view: ViewSize
  paddingPx: number
  minZoom: number
  maxZoom: number
}

function busiestNode(rects: ReadonlyMap<string, Rect>, edges: readonly { source: string; target: string }[]) {
  const degree = new Map<string, number>()
  for (const edge of edges) {
    if (rects.has(edge.source)) degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1)
    if (rects.has(edge.target)) degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1)
  }
  let best: string | null = null
  for (const [id, count] of degree) if (best === null || count > degree.get(best)!) best = id
  return best
}

function neighbourCluster(
  focusId: string,
  rects: ReadonlyMap<string, Rect>,
  edges: readonly { source: string; target: string }[],
  spanX: number,
  spanY: number,
): Rect {
  const focus = rects.get(focusId)!
  const origin = rectCenter(focus)
  const neighbours = edges
    .flatMap((edge) => (edge.source === focusId ? [edge.target] : edge.target === focusId ? [edge.source] : []))
    .map((id) => rects.get(id))
    .filter((rect) => rect !== undefined)
    .toSorted((a, b) => {
      const pa = rectCenter(a)
      const pb = rectCenter(b)
      return Math.hypot(pa.x - origin.x, pa.y - origin.y) - Math.hypot(pb.x - origin.x, pb.y - origin.y)
    })
  let cluster = focus
  for (const rect of neighbours) {
    const candidate = unionRects([cluster, rect])!
    if (candidate.width <= spanX && candidate.height <= spanY) cluster = candidate
  }
  return cluster
}

function clampCenter(value: number, low: number, high: number, span: number): number {
  if (high - low <= span) return (low + high) / 2
  return Math.min(high - span / 2, Math.max(low + span / 2, value))
}

/**
 * Returns the viewport that shows all of the diagram, if its text stays readable at that zoom.
 *
 * If the full diagram needs a zoom below `minZoom`, the viewport frames the node with the most connections. It also
 * frames as many neighbours as fit at `minZoom` or more. The viewport stays inside the diagram bounds.
 */
export function readableViewport({
  bounds,
  rects,
  edges,
  view,
  paddingPx,
  minZoom,
  maxZoom,
}: ReadableFraming): Viewport {
  const availableWidth = Math.max(1, view.width - paddingPx * 2)
  const availableHeight = Math.max(1, view.height - paddingPx * 2)
  const fit = (rect: Rect) =>
    Math.min(maxZoom, availableWidth / Math.max(1, rect.width), availableHeight / Math.max(1, rect.height))
  let zoom = fit(bounds)
  let { x: centerX, y: centerY } = rectCenter(bounds)
  if (zoom < minZoom) {
    zoom = minZoom
    const focusId = busiestNode(rects, edges)
    if (focusId) {
      const cluster = neighbourCluster(focusId, rects, edges, availableWidth / minZoom, availableHeight / minZoom)
      zoom = Math.max(minZoom, fit(cluster))
      const spanX = availableWidth / zoom
      const spanY = availableHeight / zoom
      const clusterCenter = rectCenter(cluster)
      centerX = clampCenter(clusterCenter.x, bounds.x, bounds.x + bounds.width, spanX)
      centerY = clampCenter(clusterCenter.y, bounds.y, bounds.y + bounds.height, spanY)
    }
  }
  return { x: view.width / 2 - centerX * zoom, y: view.height / 2 - centerY * zoom, zoom }
}
