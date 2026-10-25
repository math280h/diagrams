import type { Flow, Step } from '@/model/schema'

export interface EdgeEnds {
  id: string
  source: string
  target: string
}

export interface TimelineSegment {
  step: Step
  index: number
  startMs: number
  endMs: number
  /** For an edge step: true if the token moves from the edge target to the edge source. */
  reversed: boolean
  /** The node where the token is at the start of the segment. */
  fromNode: string | null
  /** The node where the token is at the end of the segment. */
  toNode: string | null
}

export interface Timeline {
  flow: Flow
  segments: TimelineSegment[]
  /** The end of the last step or of the last keyframe, whichever is later. */
  durationMs: number
}

/**
 * Returns how the token travels along an edge after it rests on `lastNode`. It goes against the edge direction if
 * `lastNode` is the edge target, else along it.
 */
export function edgeTravel(edge: EdgeEnds, lastNode: string | null) {
  const reversed = lastNode !== null && lastNode === edge.target && lastNode !== edge.source
  return { reversed, fromNode: reversed ? edge.target : edge.source, toNode: reversed ? edge.source : edge.target }
}

/**
 * Converts the steps of a flow into timed segments.
 *
 * The function drops a step if its node or edge does not exist.
 */
export function compileFlow(flow: Flow, nodeIds: ReadonlySet<string>, edges: readonly EdgeEnds[]): Timeline {
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]))
  const segments: TimelineSegment[] = []
  let cursor = 0
  let lastNode: string | null = null

  for (const step of flow.steps) {
    let fromNode: string | null
    let toNode: string | null
    let reversed = false

    if (step.target.kind === 'node') {
      if (!nodeIds.has(step.target.id)) continue
      fromNode = step.target.id
      toNode = step.target.id
    } else {
      const edge = edgeById.get(step.target.id)
      if (!edge) continue
      ;({ reversed, fromNode, toNode } = edgeTravel(edge, lastNode))
    }

    segments.push({
      step,
      index: segments.length,
      startMs: cursor,
      endMs: cursor + step.durationMs,
      reversed,
      fromNode,
      toNode,
    })
    cursor += step.durationMs
    lastNode = toNode
  }

  let durationMs = cursor
  for (const track of flow.tracks) {
    for (const keyframe of track.keyframes) durationMs = Math.max(durationMs, keyframe.atMs)
  }

  return { flow, segments, durationMs }
}

/** Returns the index of the segment at the time, or -1 if the timeline has no segments. */
export function segmentIndexAt(timeline: Timeline, timeMs: number): number {
  const { segments } = timeline
  if (segments.length === 0) return -1
  let low = 0
  let high = segments.length - 1
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if (segments[mid]!.startMs <= timeMs) low = mid
    else high = mid - 1
  }
  return low
}
