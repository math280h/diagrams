import { interpolateZoom } from 'd3-interpolate'
import { rectCenter, type Rect } from '@/model/rect'

export { unionRects, type Rect } from '@/model/rect'

/** A camera position. `x` and `y` are the center of the view in canvas coordinates. */
export interface Camera {
  x: number
  y: number
  zoom: number
}

export interface ViewSize {
  width: number
  height: number
}

export interface Viewport {
  x: number
  y: number
  zoom: number
}

export function cameraToViewport(camera: Camera, view: ViewSize): Viewport {
  return {
    x: view.width / 2 - camera.x * camera.zoom,
    y: view.height / 2 - camera.y * camera.zoom,
    zoom: camera.zoom,
  }
}

export function viewportToCamera(viewport: Viewport, view: ViewSize): Camera {
  return {
    x: (view.width / 2 - viewport.x) / viewport.zoom,
    y: (view.height / 2 - viewport.y) / viewport.zoom,
    zoom: viewport.zoom,
  }
}

/**
 * Returns the camera that shows all of the rectangle.
 *
 * @param paddingPx - The free space at each side of the view, in screen pixels.
 */
export function fitCamera(rect: Rect, view: ViewSize, paddingPx: number, maxZoom: number, minZoom = 0.1): Camera {
  const availableWidth = Math.max(1, view.width - paddingPx * 2)
  const availableHeight = Math.max(1, view.height - paddingPx * 2)
  const zoom = Math.min(
    maxZoom,
    Math.max(minZoom, Math.min(availableWidth / Math.max(1, rect.width), availableHeight / Math.max(1, rect.height))),
  )
  return { ...rectCenter(rect), zoom }
}

/**
 * Returns a camera between two cameras.
 *
 * The path zooms out and in on long moves, as d3 `interpolateZoom` does.
 *
 * @param t - The progress from 0 to 1.
 */
export function blendCameras(from: Camera, to: Camera, t: number, view: ViewSize): Camera {
  if (t <= 0) return from
  if (t >= 1) return to
  const interpolate = interpolateZoom([from.x, from.y, view.width / from.zoom], [to.x, to.y, view.width / to.zoom])
  const [x, y, w] = interpolate(t)
  return { x, y, zoom: view.width / w }
}
