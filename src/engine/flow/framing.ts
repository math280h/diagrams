import type { CameraMotion } from '@/model/schema'
import { blendCameras, fitCamera, unionRects, type Camera, type Rect, type ViewSize } from '@/engine/camera'
import { clamp01, easeInOutCubic, easeInOutSine, lerp } from '@/engine/easing'
import { segmentIndexAt, type Timeline, type TimelineSegment } from './compile'
import type { FlowGeometry } from './evaluate'

const OVERVIEW_PADDING_PX = 96
const OVERVIEW_PADDING_SHARE = 0.12
const OVERVIEW_MAX_ZOOM = 1.2
const FULL_ZOOM_VIEW_WIDTH = 1000
const MIN_VIEW_ZOOM_SCALE = 0.7
const LEGIBLE_SHARE = 0.7
const KEEP_ZOOM_RATIO = 1.25
const SAFE_MARGIN_SHARE = 0.12
const SAFE_MARGIN_MIN_PX = 24
const BOUNDS_MARGIN_PX = 48
const TEXT_CLEARANCE_PX = 16
const TEXT_ZOOM_OUT_STEP = 0.9
const TEXT_OVERSHOOT_SHARE = 0.25
const SAME_ZOOM_LOG = 0.01
const CUT_FADE_HALF_MS = 180
const CUT_FADE_DEPTH = 0.85

const MOTIONS: Record<CameraMotion, { durationMs: number; ease: (t: number) => number }> = {
  gentle: { durationMs: 1000, ease: easeInOutSine },
  quick: { durationMs: 550, ease: easeInOutCubic },
  slow: { durationMs: 1600, ease: easeInOutSine },
}

interface Span {
  start: number
  end: number
}

interface Margins {
  x: number
  y: number
}

/** Returns the share of the step zoom that a view of this width uses, from 0.7 to 1. */
export function viewZoomScale(view: ViewSize): number {
  return Math.min(1, Math.max(MIN_VIEW_ZOOM_SCALE, view.width / FULL_ZOOM_VIEW_WIDTH))
}

function safeMargins(view: ViewSize): Margins {
  return {
    x: Math.max(SAFE_MARGIN_MIN_PX, view.width * SAFE_MARGIN_SHARE),
    y: Math.max(SAFE_MARGIN_MIN_PX, view.height * SAFE_MARGIN_SHARE),
  }
}

/** Returns the camera that shows the whole diagram. */
export function overviewCamera(geometry: FlowGeometry, view: ViewSize): Camera {
  const bounds = geometry.bounds()
  if (!bounds) return { x: 0, y: 0, zoom: 1 }
  const paddingPx = Math.min(OVERVIEW_PADDING_PX, Math.min(view.width, view.height) * OVERVIEW_PADDING_SHARE)
  return fitCamera(bounds, view, paddingPx, OVERVIEW_MAX_ZOOM)
}

/**
 * Returns the rectangle around the nodes that the lanes of a segment leave and reach.
 *
 * @param arrivalOnly - If true, only the nodes that the lanes reach count.
 */
export function segmentRect(segment: TimelineSegment, geometry: FlowGeometry, arrivalOnly = false): Rect | null {
  const rects: Rect[] = []
  for (const id of new Set(
    segment.lanes.flatMap((lane) => (arrivalOnly ? [lane.toNode] : [lane.fromNode, lane.toNode])),
  )) {
    const rect = id ? geometry.nodeRect(id) : null
    if (rect) rects.push(rect)
  }
  return unionRects(rects)
}

function safeFitZoom(rect: Rect, view: ViewSize): number {
  const margins = safeMargins(view)
  return Math.min(
    Math.max(1, view.width - margins.x * 2) / Math.max(1, rect.width),
    Math.max(1, view.height - margins.y * 2) / Math.max(1, rect.height),
  )
}

function viewSpan(center: number, size: number): Span {
  return { start: center - size / 2, end: center + size / 2 }
}

function visibleRect(camera: Camera, view: ViewSize): Rect {
  const width = view.width / camera.zoom
  const height = view.height / camera.zoom
  return { x: camera.x - width / 2, y: camera.y - height / 2, width, height }
}

function insideSafeArea(rect: Rect, camera: Camera, view: ViewSize): boolean {
  const margins = safeMargins(view)
  const x = viewSpan(camera.x, (view.width - margins.x * 2) / camera.zoom)
  const y = viewSpan(camera.y, (view.height - margins.y * 2) / camera.zoom)
  const slack = 0.5 / camera.zoom
  return (
    rect.x >= x.start - slack &&
    rect.x + rect.width <= x.end + slack &&
    rect.y >= y.start - slack &&
    rect.y + rect.height <= y.end + slack
  )
}

function containAxis(center: number, safeSize: number, start: number, size: number): number {
  const low = start + size - safeSize / 2
  const high = start + safeSize / 2
  return low > high ? start + size / 2 : Math.min(high, Math.max(low, center))
}

function containRect(camera: Camera, rect: Rect, view: ViewSize): Camera {
  const margins = safeMargins(view)
  return {
    x: containAxis(camera.x, (view.width - margins.x * 2) / camera.zoom, rect.x, rect.width),
    y: containAxis(camera.y, (view.height - margins.y * 2) / camera.zoom, rect.y, rect.height),
    zoom: camera.zoom,
  }
}

/**
 * Moves the camera so that the view does not go past the diagram by more than a margin.
 *
 * @param overshootShare - The share of the view that may go past the margin, from 0.
 */
export function keepInBounds(camera: Camera, geometry: FlowGeometry, view: ViewSize, overshootShare = 0): Camera {
  const bounds = geometry.bounds()
  if (!bounds) return camera
  const axis = (value: number, start: number, size: number, span: number) => {
    const margin = BOUNDS_MARGIN_PX / camera.zoom + span * overshootShare
    const low = start - margin + span / 2
    const high = start + size + margin - span / 2
    return low > high ? start + size / 2 : Math.min(high, Math.max(low, value))
  }
  return {
    x: axis(camera.x, bounds.x, bounds.width, view.width / camera.zoom),
    y: axis(camera.y, bounds.y, bounds.height, view.height / camera.zoom),
    zoom: camera.zoom,
  }
}

function cuts(text: Rect, visible: Rect): boolean {
  const overlaps =
    text.x < visible.x + visible.width &&
    text.x + text.width > visible.x &&
    text.y < visible.y + visible.height &&
    text.y + text.height > visible.y
  const inside =
    text.x >= visible.x &&
    text.x + text.width <= visible.x + visible.width &&
    text.y >= visible.y &&
    text.y + text.height <= visible.y + visible.height
  return overlaps && !inside
}

function textShifts(text: Rect, visible: Rect, clearance: number): { dx: number; dy: number }[] {
  const shifts = [
    { dx: text.x + text.width - visible.x, dy: 0 },
    { dx: text.x - (visible.x + visible.width), dy: 0 },
    { dx: 0, dy: text.y + text.height - visible.y },
    { dx: 0, dy: text.y - (visible.y + visible.height) },
  ]
  const fits = text.width + clearance * 2 <= visible.width && text.height + clearance * 2 <= visible.height
  if (fits) {
    const axis = (start: number, size: number, viewStart: number, viewSize: number) => {
      if (start < viewStart) return start - clearance - viewStart
      if (start + size > viewStart + viewSize) return start + size + clearance - (viewStart + viewSize)
      return 0
    }
    shifts.push({
      dx: axis(text.x, text.width, visible.x, visible.width),
      dy: axis(text.y, text.height, visible.y, visible.height),
    })
  }
  return shifts.toSorted((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy))
}

function showTextsWhole(
  camera: Camera,
  keep: Rect,
  texts: Rect[],
  geometry: FlowGeometry,
  view: ViewSize,
): Camera | null {
  let result = camera
  for (const text of texts) {
    const visible = visibleRect(result, view)
    if (!cuts(text, visible)) continue
    for (const { dx, dy } of textShifts(text, visible, TEXT_CLEARANCE_PX / result.zoom)) {
      const shifted = { x: result.x + dx, y: result.y + dy, zoom: result.zoom }
      const moved = keepInBounds(shifted, geometry, view, TEXT_OVERSHOOT_SHARE)
      if (!insideSafeArea(keep, moved, view) || cuts(text, visibleRect(moved, view))) continue
      result = moved
      break
    }
  }
  const visible = visibleRect(result, view)
  return texts.some((text) => cuts(text, visible)) ? null : result
}

function avoidCutTexts(
  camera: Camera,
  keep: Rect,
  texts: Rect[],
  geometry: FlowGeometry,
  view: ViewSize,
  minZoom = camera.zoom,
): Camera {
  for (let zoom = camera.zoom; zoom >= minZoom; zoom *= TEXT_ZOOM_OUT_STEP) {
    const start =
      zoom === camera.zoom ? camera : keepInBounds(containRect({ ...camera, zoom }, keep, view), geometry, view)
    const shown = showTextsWhole(start, keep, texts, geometry, view)
    if (shown) return shown
  }
  return camera
}

function rectOfFittingSteps(
  timeline: Timeline,
  index: number,
  focus: Rect,
  zoom: number,
  geometry: FlowGeometry,
  view: ViewSize,
): Rect {
  let result = focus
  for (const segment of timeline.segments.slice(index + 1)) {
    if (segment.step.camera === 'fit') break
    if (segment.step.camera === 'hold') continue
    const rect = segmentRect(segment, geometry)
    if (!rect) continue
    const grown = unionRects([result, rect])!
    if (safeFitZoom(grown, view) < zoom) break
    result = grown
  }
  return result
}

function overviewLegible(timeline: Timeline, overview: Camera, view: ViewSize): boolean {
  const zooms = timeline.segments
    .filter((segment) => segment.step.camera === 'follow')
    .map((segment) => segment.step.zoom)
    .toSorted((a, b) => a - b)
  const median = zooms[Math.floor(zooms.length / 2)] ?? 1
  return overview.zoom >= median * viewZoomScale(view) * LEGIBLE_SHARE
}

function followFrame(
  timeline: Timeline,
  index: number,
  previous: Camera,
  overview: Camera,
  holdOverview: boolean,
  geometry: FlowGeometry,
  view: ViewSize,
  texts: Rect[],
): Camera {
  const segment = timeline.segments[index]!
  const readingZoom = segment.step.zoom * viewZoomScale(view)
  const legibleZoom = readingZoom * LEGIBLE_SHARE
  const ends = segmentRect(segment, geometry)
  if (!ends) return previous
  const focus = safeFitZoom(ends, view) < legibleZoom ? (segmentRect(segment, geometry, true) ?? ends) : ends
  const fitZoom = safeFitZoom(focus, view)
  const keepZoom =
    previous.zoom > overview.zoom &&
    previous.zoom >= legibleZoom &&
    previous.zoom <= readingZoom * KEEP_ZOOM_RATIO &&
    previous.zoom <= fitZoom
  if (!keepZoom && holdOverview) return overview
  const zoom = keepZoom ? previous.zoom : Math.max(overview.zoom, Math.min(readingZoom, fitZoom))
  if (zoom <= overview.zoom) return overview

  const moving = zoom !== previous.zoom || !insideSafeArea(focus, { ...previous, zoom }, view)
  const keep = moving ? rectOfFittingSteps(timeline, index, focus, zoom, geometry, view) : focus
  const placed = keepInBounds(containRect({ x: previous.x, y: previous.y, zoom }, keep, view), geometry, view)
  return avoidCutTexts(placed, focus, texts, geometry, view, Math.max(legibleZoom, overview.zoom))
}

/**
 * Returns the camera frame of each step of the flow.
 *
 * Follow steps keep the whole diagram in view while it is legible at the median zoom of the steps. Otherwise the frame moves only when the step
 * leaves the safe area, and the zoom changes only when the step does not fit or the view is too far out to read. An
 * edge whose two ends do not fit at a legible zoom gets the frame of the node that the token goes to.
 */
export function stepFrames(timeline: Timeline, geometry: FlowGeometry, view: ViewSize): Camera[] {
  const overview = overviewCamera(geometry, view)
  const texts = geometry.texts?.() ?? []
  const holdOverview = overviewLegible(timeline, overview, view)
  const frames: Camera[] = []
  let previous = overview
  timeline.segments.forEach((segment, index) => {
    const { step } = segment
    let frame = previous
    if (step.camera === 'fit') {
      const focus = segmentRect(segment, geometry)
      if (focus) {
        const paddingPx = Math.min(OVERVIEW_PADDING_PX, Math.min(view.width, view.height) * OVERVIEW_PADDING_SHARE)
        const fitted = fitCamera(focus, view, paddingPx, step.zoom * viewZoomScale(view))
        frame = avoidCutTexts(keepInBounds(fitted, geometry, view), focus, texts, geometry, view)
      }
    } else if (step.camera === 'follow') {
      frame = followFrame(timeline, index, previous, overview, holdOverview, geometry, view, texts)
    }
    frames.push(frame)
    previous = frame
  })
  return frames
}

function sameCamera(a: Camera, b: Camera): boolean {
  return Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01 && Math.abs(a.zoom - b.zoom) < 1e-4
}

function glide(from: Camera, to: Camera, t: number, view: ViewSize): Camera {
  if (Math.abs(Math.log(to.zoom / from.zoom)) >= SAME_ZOOM_LOG) return blendCameras(from, to, t, view)
  return { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t), zoom: lerp(from.zoom, to.zoom, t) }
}

function moveSpans(timeline: Timeline, durationMs: number): Span[] {
  const spans: Span[] = []
  let previousEnd = 0
  timeline.segments.forEach((segment, index) => {
    const start = index === 0 ? 0 : Math.max(previousEnd, segment.startMs - durationMs / 2)
    const end = Math.max(start, Math.min(start + durationMs, segment.endMs))
    spans.push({ start, end })
    previousEnd = end
  })
  return spans
}

function cutFade(timeMs: number, boundaryMs: number): number {
  const distance = clamp01(Math.abs(timeMs - boundaryMs) / CUT_FADE_HALF_MS)
  return 1 - CUT_FADE_DEPTH * ((1 + Math.cos(Math.PI * distance)) / 2)
}

export interface FramedCamera {
  camera: Camera
  /** The opacity of the canvas, from 0 to 1. It dips during a cut with reduced motion. */
  opacity: number
}

/**
 * Returns the camera that the steps of the flow give at the time.
 *
 * The camera moves into the frame of a step around the start of the step, with the ease of `motion`. With reduced
 * motion, it cuts at the start of the step and the canvas fades out and in around the cut.
 */
export function framedCameraAt(
  timeline: Timeline,
  timeMs: number,
  geometry: FlowGeometry,
  view: ViewSize,
  motion: CameraMotion,
  reducedMotion = false,
): FramedCamera {
  const overview = overviewCamera(geometry, view)
  const { segments } = timeline
  if (segments.length === 0) return { camera: overview, opacity: 1 }
  const frames = stepFrames(timeline, geometry, view)

  if (reducedMotion) {
    const index = Math.max(0, segmentIndexAt(timeline, timeMs))
    let opacity = 1
    for (const boundary of [index, index + 1]) {
      const segment = segments[boundary]
      if (boundary === 0 || !segment || sameCamera(frames[boundary - 1]!, frames[boundary]!)) continue
      opacity = Math.min(opacity, cutFade(timeMs, segment.startMs))
    }
    return { camera: frames[index]!, opacity }
  }

  const { durationMs, ease } = MOTIONS[motion]
  const spans = moveSpans(timeline, durationMs)
  let camera = overview
  for (let index = 0; index < spans.length; index++) {
    const span = spans[index]!
    if (timeMs < span.start) break
    const from = index === 0 ? overview : frames[index - 1]!
    const to = frames[index]!
    if (timeMs >= span.end || span.end <= span.start) {
      camera = to
      continue
    }
    camera = glide(from, to, ease(clamp01((timeMs - span.start) / (span.end - span.start))), view)
    break
  }
  return { camera, opacity: 1 }
}
