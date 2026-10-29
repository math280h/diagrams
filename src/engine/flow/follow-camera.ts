import { rectCenter } from '@/model/rect'
import type { XY } from '@/model/schema'
import { blendCameras, fitCamera, type Camera, type ViewSize } from '@/engine/camera'
import { clamp01, easeInOutCubic } from '@/engine/easing'
import { segmentIndexAt, type Timeline } from './compile'
import type { FlowGeometry } from './evaluate'
import { keepInBounds, overviewCamera, pathRect, segmentRect, viewZoomScale } from './framing'

const INTRO_MS = 1500
const POSITION_WINDOW_MS = 1000
const ZOOM_WINDOW_MS = 1600
const FOLLOW_SAMPLES_PER_WINDOW = 16
const MAX_STEP_ZOOM_RATIO = 1.35
const FIT_PADDING_PX = 96

/** The token point of the main lane of a segment at a time in it. */
export type TokenPoint = (index: number, timeMs: number) => XY | null

function kernelShare(share: number): number {
  return (1 - Math.cos(Math.PI * clamp01(share))) / 2
}

function stepZooms(timeline: Timeline, geometry: FlowGeometry, view: ViewSize): number[] {
  const zooms: number[] = []
  const overview = overviewCamera(geometry, view).zoom
  for (const segment of timeline.segments) {
    const previous = zooms.length > 0 ? zooms[zooms.length - 1]! : null
    const { step } = segment
    let zoom: number
    if (segment.target.kind === 'flow') {
      const path = pathRect(timeline, geometry)
      zoom = path ? fitCamera(path, view, FIT_PADDING_PX, step.zoom * viewZoomScale(view)).zoom : overview
    } else if (step.camera === 'hold') {
      zoom = previous ?? overview
    } else if (step.camera === 'fit' || segment.lanes.length > 1) {
      const rect = segmentRect(segment, geometry)
      zoom = rect ? fitCamera(rect, view, FIT_PADDING_PX, step.zoom * viewZoomScale(view)).zoom : overview
      if (previous !== null) zoom = Math.min(zoom, previous * MAX_STEP_ZOOM_RATIO)
    } else {
      zoom = step.zoom * viewZoomScale(view)
      if (previous !== null) {
        zoom = Math.min(previous * MAX_STEP_ZOOM_RATIO, Math.max(previous / MAX_STEP_ZOOM_RATIO, zoom))
      }
    }
    zooms.push(zoom)
  }
  return zooms
}

function targetCamera(
  timeline: Timeline,
  index: number,
  timeMs: number,
  geometry: FlowGeometry,
  view: ViewSize,
  zooms: number[],
  still: boolean,
  tokenPoint: TokenPoint,
): Camera {
  const segment = timeline.segments[index]
  if (!segment) return overviewCamera(geometry, view)
  const zoom = zooms[index]!
  const { step } = segment
  if (segment.target.kind === 'flow') {
    const path = pathRect(timeline, geometry)
    return path ? { ...rectCenter(path), zoom } : overviewCamera(geometry, view)
  }
  if (step.camera === 'hold') {
    if (index === 0) return overviewCamera(geometry, view)
    const previous = timeline.segments[index - 1]!
    return targetCamera(timeline, index - 1, previous.endMs, geometry, view, zooms, still, tokenPoint)
  }
  if (step.camera === 'fit' || still || segment.lanes.length > 1) {
    const rect = segmentRect(segment, geometry)
    return rect ? { ...rectCenter(rect), zoom } : overviewCamera(geometry, view)
  }
  const arrival = segment.toNode ? geometry.nodeRect(segment.toNode) : null
  const point = tokenPoint(index, timeMs) ?? (arrival ? rectCenter(arrival) : null)
  return point ? { ...point, zoom } : overviewCamera(geometry, view)
}

/**
 * Returns the camera that follows the token at the zoom of each step.
 *
 * The camera is a weighted mean of the step targets over a time window around the time, so it starts to move before a
 * step starts and it does not jump. With reduced motion, it cuts to each step.
 */
export function followCameraAt(
  timeline: Timeline,
  timeMs: number,
  geometry: FlowGeometry,
  view: ViewSize,
  tokenPoint: TokenPoint,
  reducedMotion = false,
): Camera {
  const { segments } = timeline
  if (segments.length === 0) return overviewCamera(geometry, view)
  const zooms = stepZooms(timeline, geometry, view)
  const target = (index: number, atMs: number, still: boolean) =>
    targetCamera(timeline, index, atMs, geometry, view, zooms, still, tokenPoint)
  if (reducedMotion) {
    return keepInBounds(target(segmentIndexAt(timeline, timeMs), timeMs, true), geometry, view)
  }

  const overlaps = (windowMs: number) => {
    const low = timeMs - windowMs / 2
    const high = timeMs + windowMs / 2
    const result: { index: number; from: number; to: number }[] = []
    for (let index = segmentIndexAt(timeline, low); index < segments.length; index++) {
      const segment = segments[index]!
      const start = index === 0 ? -Infinity : segment.startMs
      const end = index === segments.length - 1 ? Infinity : segment.endMs
      if (start >= high) break
      const from = (Math.max(low, start) - low) / windowMs
      const to = (Math.min(high, end) - low) / windowMs
      if (to > from) result.push({ index, from, to })
    }
    return result
  }

  let logZoom = 0
  for (const { index, from, to } of overlaps(ZOOM_WINDOW_MS)) {
    logZoom += Math.log(zooms[index]!) * (kernelShare(to) - kernelShare(from))
  }

  let x = 0
  let y = 0
  const positionLow = timeMs - POSITION_WINDOW_MS / 2
  for (const { index, from, to } of overlaps(POSITION_WINDOW_MS)) {
    const segment = segments[index]!
    if (segment.step.camera !== 'follow' || segment.lanes.length > 1) {
      const camera = target(index, segment.startMs, false)
      const weight = kernelShare(to) - kernelShare(from)
      x += camera.x * weight
      y += camera.y * weight
      continue
    }
    const parts = Math.max(2, Math.ceil(FOLLOW_SAMPLES_PER_WINDOW * (to - from)))
    for (let part = 0; part < parts; part++) {
      const a = from + ((to - from) * part) / parts
      const b = from + ((to - from) * (part + 1)) / parts
      const sampleMs = Math.min(
        segment.endMs,
        Math.max(segment.startMs, positionLow + ((a + b) / 2) * POSITION_WINDOW_MS),
      )
      const camera = target(index, sampleMs, false)
      const weight = kernelShare(b) - kernelShare(a)
      x += camera.x * weight
      y += camera.y * weight
    }
  }
  const smooth = keepInBounds({ x, y, zoom: Math.exp(logZoom) }, geometry, view)
  if (timeMs >= INTRO_MS) return smooth
  return blendCameras(overviewCamera(geometry, view), smooth, easeInOutCubic(clamp01(timeMs / INTRO_MS)), view)
}
