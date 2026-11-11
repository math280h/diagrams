import { findPath, pathSteps, sidePaths, stepTargets } from '@/model/flow'
import type { Flow, FlowPath, Step, StepTarget, Target } from '@/model/schema'

export interface EdgeEnds {
  id: string
  source: string
  target: string
  data?: { noReply?: boolean }
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
  /** The index of the segment in its list: the main segments, or the segments of a side path. */
  index: number
  startMs: number
  endMs: number
  /**
   * The main target first, then the parallel targets that exist. The fields of the segment repeat the first lane. An
   * overview step has no lanes.
   */
  lanes: Lane[]
  /** The path or the side path that holds the step, or `null` for a main step. */
  pathId: string | null
}

/** The steps of a side path, at the same time as the main steps after the step where it starts. */
export interface SideTrack {
  path: FlowPath
  /** The main segment after which the side path starts. */
  from: TimelineSegment
  /** The segments of the side path, one after the other from the end of `from`. The list can be empty. */
  segments: TimelineSegment[]
}

export interface Timeline {
  flow: Flow
  /** The path that the timeline plays, or `null` for the main steps. */
  pathId: string | null
  /** The main track: the main steps, or the steps of the path. */
  segments: TimelineSegment[]
  /** The side paths that start after one of the segments, in the order of the paths of the flow. */
  sides: SideTrack[]
  /** The end of the last step of all tracks or of the last keyframe, whichever is later. */
  durationMs: number
}

/**
 * Returns how a token travels along an edge after the tokens rest on `lastNodes`. It goes against the edge direction
 * if the edge target is one of them and the edge source is not, else along it. It never goes back along an edge that
 * does not reply.
 */
export function edgeTravel(edge: EdgeEnds, lastNodes: string | null | ReadonlySet<string>) {
  const rests = (id: string) =>
    lastNodes === null ? false : typeof lastNodes === 'string' ? lastNodes === id : lastNodes.has(id)
  const reversed = !edge.data?.noReply && rests(edge.target) && !rests(edge.source)
  return { reversed, fromNode: reversed ? edge.target : edge.source, toNode: reversed ? edge.source : edge.target }
}

/** Returns the nodes where the lanes leave a token at the end of their segment. */
export function restingNodes(lanes: readonly Pick<Lane, 'toNode'>[]): Set<string> {
  return new Set(lanes.flatMap((candidate) => (candidate.toNode ? [candidate.toNode] : [])))
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

interface TrackStart {
  startMs: number
  /** The nodes where the tokens rest before the first step. */
  resting: ReadonlySet<string>
}

function compileSteps(
  steps: readonly Step[],
  nodeIds: ReadonlySet<string>,
  edgeById: ReadonlyMap<string, EdgeEnds>,
  start: TrackStart,
  pathOf: (step: Step) => string | null,
): TimelineSegment[] {
  const segments: TimelineSegment[] = []
  let cursor = start.startMs
  let lastNodes = start.resting
  for (const step of steps) {
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
        pathId: pathOf(step),
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
      pathId: pathOf(step),
    })
    cursor += step.durationMs
    lastNodes = restingNodes(lanes)
  }
  return segments
}

/**
 * Converts the steps of a flow into timed segments.
 *
 * The function drops a step if its main node or edge does not exist, and a parallel target that does not exist. Each
 * side path that starts after a played step gets its own track, see {@link SideTrack}.
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
  const segments = compileSteps(
    pathSteps(flow, pathId),
    nodeIds,
    edgeById,
    { startMs: 0, resting: new Set() },
    (step) => (path && pathStepIds.has(step.id) ? path.id : null),
  )
  const sides = sidePaths(flow).flatMap((side): SideTrack[] => {
    const from = segments.find((segment) => segment.step.id === side.fromStep)
    if (!from) return []
    const start = { startMs: from.endMs, resting: restingNodes(from.lanes) }
    return [{ path: side, from, segments: compileSteps(side.steps, nodeIds, edgeById, start, () => side.id) }]
  })

  let durationMs = segments.at(-1)?.endMs ?? 0
  for (const side of sides) durationMs = Math.max(durationMs, side.segments.at(-1)?.endMs ?? 0)
  for (const track of flow.tracks) {
    for (const keyframe of track.keyframes) durationMs = Math.max(durationMs, keyframe.atMs)
  }

  return { flow, pathId: path?.id ?? null, segments, sides, durationMs }
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
