import { findPath, pathSteps, stepTargets } from '@/model/flow'
import type { Flow, Step, StepTarget, Target } from '@/model/schema'

export interface EdgeEnds {
  id: string
  source: string
  target: string
}

/** One token of a step: the main target, or one of the parallel targets. */
export interface Lane {
  target: Target
  /** For an edge: true if the token moves from the edge target to the edge source. */
  reversed: boolean
  /** The node where the token is at the start of the segment. */
  fromNode: string | null
  /** The node where the token is at the end of the segment. */
  toNode: string | null
}

export interface TimelineSegment extends Omit<Lane, 'target'> {
  /** The main target, or the whole flow for an overview step. */
  target: StepTarget
  step: Step
  index: number
  startMs: number
  endMs: number
  /**
   * The main target first, then the parallel targets that exist. The fields of the segment repeat the first lane. An
   * overview step has no lanes.
   */
  lanes: Lane[]
  /** The path that holds the step, or `null` for a main step. */
  pathId: string | null
}

export interface Timeline {
  flow: Flow
  /** The path that the timeline plays, or `null` for the main steps. */
  pathId: string | null
  segments: TimelineSegment[]
  /** The end of the last step or of the last keyframe, whichever is later. */
  durationMs: number
}

/**
 * Returns how a token travels along an edge after the tokens rest on `lastNodes`. It goes against the edge direction
 * if the edge target is one of them and the edge source is not, else along it.
 */
export function edgeTravel(edge: EdgeEnds, lastNodes: string | null | ReadonlySet<string>) {
  const rests = (id: string) =>
    lastNodes === null ? false : typeof lastNodes === 'string' ? lastNodes === id : lastNodes.has(id)
  const reversed = rests(edge.target) && !rests(edge.source)
  return { reversed, fromNode: reversed ? edge.target : edge.source, toNode: reversed ? edge.source : edge.target }
}

function lane(
  target: Target,
  nodeIds: ReadonlySet<string>,
  edgeById: ReadonlyMap<string, EdgeEnds>,
  lastNodes: ReadonlySet<string>,
): Lane | null {
  if (target.kind === 'node') {
    return nodeIds.has(target.id) ? { target, reversed: false, fromNode: target.id, toNode: target.id } : null
  }
  const edge = edgeById.get(target.id)
  return edge ? { target, ...edgeTravel(edge, lastNodes) } : null
}

/**
 * Converts the steps of a flow into timed segments.
 *
 * The function drops a step if its main node or edge does not exist, and a parallel target that does not exist.
 *
 * @param pathId - The path to play, or `null` for the main steps. See {@link pathSteps}.
 */
export function compileFlow(
  flow: Flow,
  nodeIds: ReadonlySet<string>,
  edges: readonly EdgeEnds[],
  pathId: string | null = null,
): Timeline {
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]))
  const path = findPath(flow, pathId)
  const pathStepIds = new Set(path?.steps.map((step) => step.id))
  const segments: TimelineSegment[] = []
  let cursor = 0
  let lastNodes: ReadonlySet<string> = new Set()

  for (const step of pathSteps(flow, pathId)) {
    if (step.target.kind === 'flow') {
      segments.push({
        target: step.target,
        reversed: false,
        fromNode: null,
        toNode: null,
        step,
        index: segments.length,
        startMs: cursor,
        endMs: cursor + step.durationMs,
        lanes: [],
        pathId: path && pathStepIds.has(step.id) ? path.id : null,
      })
      cursor += step.durationMs
      continue
    }
    const [main, ...parallel] = stepTargets(step).map((target) => lane(target, nodeIds, edgeById, lastNodes))
    if (!main) continue
    const lanes = [main, ...parallel.filter((candidate): candidate is Lane => candidate !== null)]
    segments.push({
      ...main,
      step,
      index: segments.length,
      startMs: cursor,
      endMs: cursor + step.durationMs,
      lanes,
      pathId: path && pathStepIds.has(step.id) ? path.id : null,
    })
    cursor += step.durationMs
    lastNodes = new Set(lanes.flatMap((candidate) => (candidate.toNode ? [candidate.toNode] : [])))
  }

  let durationMs = cursor
  for (const track of flow.tracks) {
    for (const keyframe of track.keyframes) durationMs = Math.max(durationMs, keyframe.atMs)
  }

  return { flow, pathId: path?.id ?? null, segments, durationMs }
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
