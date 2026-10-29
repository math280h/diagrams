import { rectCenter } from '@/model/rect'
import type { XY } from '@/model/schema'
import { blendCameras, type Camera, type Rect, type ViewSize } from '@/engine/camera'
import { clamp01, easeInOutCubic, easeInOutSine, lerp } from '@/engine/easing'
import { pointAt, type ArcTable } from '@/engine/path-sampler'
import { segmentIndexAt, type Lane, type Timeline, type TimelineSegment } from './compile'
import { followCameraAt } from './follow-camera'
import { framedCameraAt, overviewCamera, type FramedCamera } from './framing'
import { firstKeyframeMs, sampleCameraTrack, sampleValueTrack } from './tracks'

export interface FlowGeometry {
  nodeRect(id: string): Rect | null
  edgeTable(id: string): ArcTable | null
  /** The rectangle around all nodes, or `null` if the diagram is empty. */
  bounds(): Rect | null
  /** The rectangles of the text nodes. A camera frame shows each text whole or not at all. */
  texts?(): Rect[]
}

export type ElementKey = `node:${string}` | `edge:${string}`

/** The token of a parallel target. See {@link FlowFrame.token}. */
export interface ParallelToken {
  /** The index of the lane in the segment, from 1. */
  lane: number
  point: XY
  lift: number
  label: number
}

export interface FlowFrame {
  segmentIndex: number
  token: XY | null
  /**
   * The lift of the token label above the token point, from 0 to 1.
   *
   * The value is 1 while the token moves along the top edge of a node.
   */
  tokenLift: number
  /**
   * The visibility of the token label, from 0 to 1.
   *
   * On an edge, the value is 0 near the two ends. During a node step, it is equal to
   * {@link FlowFrame.tokenLift}.
   */
  tokenLabel: number
  /** The tokens of the parallel targets of the step. */
  parallelTokens: ParallelToken[]
  activeNodes: Set<string>
  activeEdges: Set<string>
  visitedNodes: Set<string>
  visitedEdges: Set<string>
  caption: string
  camera: Camera | null
  /** The opacity of the canvas, from 0 to 1. It dips during a camera cut with reduced motion. */
  viewOpacity: number
  /** The opacity of elements with an emphasis track, from 0 to 1. */
  emphasis: Map<ElementKey, number>
  /** The traffic strength of edges with a traffic track, from 0 to 1. */
  trafficScale: Map<string, number>
}

export interface EvaluateOptions {
  camera: boolean
  /** If true, the camera cuts to each step frame. */
  reducedMotion?: boolean
}

const BRIDGE_MAX_SHARE = 0.4
const TRACK_CAMERA_LEAD_MS = 600

function edgeEnd(lane: Lane, geometry: FlowGeometry, end: 'start' | 'end'): XY | null {
  const table = geometry.edgeTable(lane.target.id)
  if (!table || table.lengthPx === 0) return null
  const atStart = (end === 'start') !== lane.reversed
  return pointAt(table, atStart ? 0 : 1)
}

function linkedEdge(
  neighbour: TimelineSegment | undefined,
  node: string | null,
  side: 'toNode' | 'fromNode',
  laneIndex: number,
): Lane | null {
  if (!neighbour) return null
  const linked = neighbour.lanes.find((candidate) => candidate.target.kind === 'edge' && candidate[side] === node)
  if (linked) return linked
  return laneIndex === 0 && neighbour.target.kind === 'edge' ? (neighbour.lanes[0] ?? null) : null
}

function nodeAnchor(id: string | null, geometry: FlowGeometry): XY | null {
  if (!id) return null
  const rect = geometry.nodeRect(id)
  return rect ? rectCenter(rect) : null
}

const LIFT_SHARE = 0.25
const LABEL_CLEAR_PX = 28
const LABEL_FADE_PX = 36

function pathToTop(rect: Rect, point: XY): XY[] {
  const left = rect.x
  const right = rect.x + rect.width
  const top = rect.y
  const bottom = rect.y + rect.height
  const distances = {
    top: Math.abs(point.y - top),
    bottom: Math.abs(point.y - bottom),
    left: Math.abs(point.x - left),
    right: Math.abs(point.x - right),
  }
  const side = (Object.keys(distances) as (keyof typeof distances)[]).reduce((best, key) =>
    distances[key] < distances[best] ? key : best,
  )
  const x = Math.min(right, Math.max(left, point.x))
  switch (side) {
    case 'top':
      return [{ x, y: top }]
    case 'left':
      return [{ x: left, y: top }]
    case 'right':
      return [{ x: right, y: top }]
    case 'bottom': {
      const corner = point.x - left < right - point.x ? left : right
      return [
        { x: corner, y: bottom },
        { x: corner, y: top },
      ]
    }
  }
}

function perimeterOffset(rect: Rect, point: XY): number {
  const { x, y, width, height } = rect
  const px = Math.min(x + width, Math.max(x, point.x))
  const py = Math.min(y + height, Math.max(y, point.y))
  const distances = [
    Math.abs(point.y - y),
    Math.abs(point.x - (x + width)),
    Math.abs(point.y - (y + height)),
    Math.abs(point.x - x),
  ]
  const side = distances.indexOf(Math.min(...distances))
  switch (side) {
    case 0:
      return px - x
    case 1:
      return width + (py - y)
    case 2:
      return width + height + (x + width - px)
    default:
      return 2 * width + height + (y + height - py)
  }
}

function perimeterPoint(rect: Rect, offset: number): XY {
  const { x, y, width, height } = rect
  const total = 2 * (width + height)
  let s = ((offset % total) + total) % total
  if (s <= width) return { x: x + s, y }
  s -= width
  if (s <= height) return { x: x + width, y: y + s }
  s -= height
  if (s <= width) return { x: x + width - s, y: y + height }
  s -= width
  return { x, y: y + height - s }
}

/** Returns the shorter way along the outline of the rectangle between two points on it. */
export function perimeterPath(rect: Rect, from: XY, to: XY): XY[] {
  const total = 2 * (rect.width + rect.height)
  if (total <= 0) return [from, to]
  const start = perimeterOffset(rect, from)
  const end = perimeterOffset(rect, to)
  const forward = (((end - start) % total) + total) % total
  const direction = forward <= total - forward ? 1 : -1
  const distance = Math.min(forward, total - forward)
  const corners = [0, rect.width, rect.width + rect.height, 2 * rect.width + rect.height]
    .map((corner) => ({
      corner,
      along: (((direction * (corner - start)) % total) + total) % total,
    }))
    .filter(({ along }) => along > 0 && along < distance)
    .toSorted((a, b) => a.along - b.along)
    .map(({ corner }) => perimeterPoint(rect, corner))
  return [from, perimeterPoint(rect, start), ...corners, perimeterPoint(rect, end), to]
}

function polylineLength(points: XY[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++)
    total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y)
  return total
}

function pointOnPolyline(points: XY[], u: number): XY {
  const total = polylineLength(points)
  if (total === 0) return points[0]!
  let remaining = clamp01(u) * total
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (remaining <= length && length > 0) {
      const t = remaining / length
      return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }
    }
    remaining -= length
  }
  return points[points.length - 1]!
}

function nodeSegmentEnds(timeline: Timeline, index: number, laneIndex: number, geometry: FlowGeometry) {
  const lane = timeline.segments[index]!.lanes[laneIndex]!
  const entry = linkedEdge(timeline.segments[index - 1], lane.toNode, 'toNode', laneIndex)
  const exit = linkedEdge(timeline.segments[index + 1], lane.toNode, 'fromNode', laneIndex)
  return {
    rect: lane.toNode ? geometry.nodeRect(lane.toNode) : null,
    entry: entry ? edgeEnd(entry, geometry, 'end') : null,
    exit: exit ? edgeEnd(exit, geometry, 'start') : null,
  }
}

function edgeBridge(timeline: Timeline, index: number, laneIndex: number, geometry: FlowGeometry): XY[] | null {
  const lane = timeline.segments[index]!.lanes[laneIndex]!
  if (!lane.fromNode) return null
  const previous = timeline.segments[index - 1]?.lanes.find(
    (candidate) => candidate.target.kind === 'edge' && candidate.toNode === lane.fromNode,
  )
  if (!previous) return null
  const rect = geometry.nodeRect(lane.fromNode)
  const entry = edgeEnd(previous, geometry, 'end')
  const start = edgeEnd(lane, geometry, 'start')
  if (!rect || !entry || !start || Math.hypot(entry.x - start.x, entry.y - start.y) < 1) return null
  return perimeterPath(rect, entry, start)
}

interface EdgeTravel {
  point: XY
  edgeShare: number | null
}

function edgeTravel(
  timeline: Timeline,
  index: number,
  laneIndex: number,
  timeMs: number,
  geometry: FlowGeometry,
): EdgeTravel | null {
  const segment = timeline.segments[index]!
  const lane = segment.lanes[laneIndex]!
  const table = geometry.edgeTable(lane.target.id)
  if (!table || table.lengthPx === 0) return null
  const span = Math.max(1, segment.endMs - segment.startMs)
  const progress = easeInOutSine(clamp01((timeMs - segment.startMs) / span))
  const bridge = edgeBridge(timeline, index, laneIndex, geometry)
  let along = progress
  if (bridge) {
    const bridgeLength = polylineLength(bridge)
    const share = Math.min(BRIDGE_MAX_SHARE, bridgeLength / (bridgeLength + table.lengthPx))
    if (progress < share) return { point: pointOnPolyline(bridge, progress / share), edgeShare: null }
    along = (progress - share) / (1 - share)
  }
  return { point: pointAt(table, lane.reversed ? 1 - along : along), edgeShare: along }
}

/**
 * Returns the token location for a segment at the time.
 *
 * During a node step, the token moves along the top edge of the node. It moves from the end of the previous edge to
 * the start of the next edge.
 */
export function tokenAt(
  timeline: Timeline,
  index: number,
  timeMs: number,
  geometry: FlowGeometry,
  laneIndex = 0,
): XY | null {
  const segment = timeline.segments[index]
  const lane = segment?.lanes[laneIndex]
  if (!segment || !lane) return null
  const span = Math.max(1, segment.endMs - segment.startMs)
  const progress = clamp01((timeMs - segment.startMs) / span)

  if (lane.target.kind === 'edge') {
    return edgeTravel(timeline, index, laneIndex, timeMs, geometry)?.point ?? nodeAnchor(lane.toNode, geometry)
  }

  const { rect, entry, exit } = nodeSegmentEnds(timeline, index, laneIndex, geometry)
  if (!rect) return null
  const topCenter = { x: rect.x + rect.width / 2, y: rect.y }
  const start = entry ? [entry, ...pathToTop(rect, entry)] : [topCenter]
  const end = exit ? [...pathToTop(rect, exit).reverse(), exit] : []
  return pointOnPolyline([...start, ...end], easeInOutCubic(progress))
}

/** Returns the visibility of the token label at the time. See {@link FlowFrame.tokenLabel}. */
export function tokenLabelAt(
  timeline: Timeline,
  index: number,
  timeMs: number,
  geometry: FlowGeometry,
  laneIndex = 0,
): number {
  const lane = timeline.segments[index]?.lanes[laneIndex]
  if (!lane) return 0
  if (lane.target.kind === 'node') return tokenLiftAt(timeline, index, timeMs, geometry, laneIndex)
  const table = geometry.edgeTable(lane.target.id)
  const travel = edgeTravel(timeline, index, laneIndex, timeMs, geometry)
  if (!table || !travel || travel.edgeShare === null) return 0
  const distancePx = Math.min(travel.edgeShare, 1 - travel.edgeShare) * table.lengthPx
  return easeInOutSine(clamp01((distancePx - LABEL_CLEAR_PX) / LABEL_FADE_PX))
}

/** Returns the lift of the token label at the time. See {@link FlowFrame.tokenLift}. */
export function tokenLiftAt(
  timeline: Timeline,
  index: number,
  timeMs: number,
  geometry: FlowGeometry,
  laneIndex = 0,
): number {
  const segment = timeline.segments[index]
  const lane = segment?.lanes[laneIndex]
  if (!segment || !lane || lane.target.kind === 'edge') return 0
  const { entry, exit } = nodeSegmentEnds(timeline, index, laneIndex, geometry)
  const span = Math.max(1, segment.endMs - segment.startMs)
  const progress = clamp01((timeMs - segment.startMs) / span)
  const rise = entry ? clamp01(progress / LIFT_SHARE) : 1
  const fall = exit ? clamp01((1 - progress) / LIFT_SHARE) : 1
  return easeInOutSine(Math.min(rise, fall))
}

function cameraAt(
  timeline: Timeline,
  timeMs: number,
  geometry: FlowGeometry,
  view: ViewSize,
  reducedMotion: boolean,
): FramedCamera {
  const { cameraStyle, cameraMotion } = timeline.flow
  const framed: FramedCamera =
    cameraStyle === 'frame'
      ? framedCameraAt(timeline, timeMs, geometry, view, cameraMotion, reducedMotion)
      : {
          camera:
            cameraStyle === 'follow'
              ? followCameraAt(
                  timeline,
                  timeMs,
                  geometry,
                  view,
                  (index, atMs) => tokenAt(timeline, index, atMs, geometry),
                  reducedMotion,
                )
              : overviewCamera(geometry, view),
          opacity: 1,
        }
  const track = timeline.flow.tracks.find((candidate) => candidate.kind === 'camera')
  if (!track || track.kind !== 'camera' || track.keyframes.length === 0) return framed
  const stepCamera = framed.camera

  const firstMs = firstKeyframeMs(track.keyframes)!
  const trackCamera = sampleCameraTrack(track.keyframes, timeMs, view)
  if (trackCamera) return { camera: trackCamera, opacity: 1 }
  const lead = (timeMs - (firstMs - TRACK_CAMERA_LEAD_MS)) / TRACK_CAMERA_LEAD_MS
  if (lead <= 0) return framed
  const firstCamera = sampleCameraTrack(track.keyframes, firstMs, view)!
  return { camera: blendCameras(stepCamera, firstCamera, easeInOutCubic(clamp01(lead)), view), opacity: 1 }
}

/** Computes the full flow state at the time. The result depends only on the arguments. */
export function evaluateFlow(
  timeline: Timeline,
  timeMs: number,
  geometry: FlowGeometry,
  view: ViewSize,
  options: EvaluateOptions,
): FlowFrame {
  const index = segmentIndexAt(timeline, timeMs)
  const framed = options.camera ? cameraAt(timeline, timeMs, geometry, view, options.reducedMotion ?? false) : null
  const frame: FlowFrame = {
    segmentIndex: index,
    token: index >= 0 ? tokenAt(timeline, index, timeMs, geometry) : null,
    tokenLift: index >= 0 ? tokenLiftAt(timeline, index, timeMs, geometry) : 0,
    tokenLabel: index >= 0 ? tokenLabelAt(timeline, index, timeMs, geometry) : 0,
    parallelTokens: [],
    activeNodes: new Set(),
    activeEdges: new Set(),
    visitedNodes: new Set(),
    visitedEdges: new Set(),
    caption: '',
    camera: framed?.camera ?? null,
    viewOpacity: framed?.opacity ?? 1,
    emphasis: new Map(),
    trafficScale: new Map(),
  }

  for (let i = 0; i <= index; i++) {
    const segment = timeline.segments[i]!
    const current = i === index
    for (const lane of segment.lanes) {
      if (lane.target.kind === 'node') {
        ;(current ? frame.activeNodes : frame.visitedNodes).add(lane.target.id)
      } else {
        ;(current ? frame.activeEdges : frame.visitedEdges).add(lane.target.id)
        if (lane.fromNode) frame.visitedNodes.add(lane.fromNode)
      }
    }
  }

  const lanes = timeline.segments[index]?.lanes.length ?? 0
  for (let lane = 1; lane < lanes; lane++) {
    const point = tokenAt(timeline, index, timeMs, geometry, lane)
    if (!point) continue
    frame.parallelTokens.push({
      lane,
      point,
      lift: tokenLiftAt(timeline, index, timeMs, geometry, lane),
      label: tokenLabelAt(timeline, index, timeMs, geometry, lane),
    })
  }
  if (timeline.segments[index]?.target.kind === 'flow') {
    for (const segment of timeline.segments) {
      for (const lane of segment.lanes) {
        if (lane.target.kind === 'edge') frame.activeEdges.add(lane.target.id)
        for (const id of [lane.fromNode, lane.toNode]) if (id) frame.activeNodes.add(id)
      }
    }
  }
  for (const id of frame.activeNodes) frame.visitedNodes.delete(id)
  for (const id of frame.activeEdges) frame.visitedEdges.delete(id)

  const segment = timeline.segments[index]
  if (segment) frame.caption = segment.step.caption

  for (const track of timeline.flow.tracks) {
    if (track.kind === 'camera') continue
    const value = sampleValueTrack(track.keyframes, timeMs)
    if (value === null) continue
    if (track.kind === 'emphasis') frame.emphasis.set(`${track.target.kind}:${track.target.id}`, value)
    else frame.trafficScale.set(track.target.id, value)
  }

  return frame
}
