import { segmentIndexAt, type SideTrack, type Timeline, type TimelineSegment } from './compile'

const views = new WeakMap<SideTrack, Timeline>()
const cameraTimelines = new WeakMap<Timeline, Timeline>()

/**
 * Returns a timeline with the segments `[side.from, ...side.segments]`, so that the token code reads the step before
 * each side step at `index - 1`. The side step at index `k` of `side.segments` is at index `k + 1`.
 */
export function sideView(timeline: Timeline, side: SideTrack): Timeline {
  let view = views.get(side)
  if (!view) {
    view = { ...timeline, pathId: side.path.id, segments: [side.from, ...side.segments], sides: [] }
    views.set(side, view)
  }
  return view
}

/**
 * Returns the index in `side.segments` of the side step at the time.
 *
 * @returns -1 before the side path starts or when it has no steps, and the number of its steps after it ends. A side
 *     path that ends with the timeline keeps its last step at the end.
 */
export function sideIndexAt(timeline: Timeline, side: SideTrack, timeMs: number): number {
  const { segments } = side
  const first = segments[0]
  if (!first || timeMs < first.startMs) return -1
  const endMs = segments.at(-1)!.endMs
  if (timeMs >= endMs && endMs < timeline.durationMs) return segments.length
  let low = 0
  let high = segments.length - 1
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if (segments[mid]!.startMs <= timeMs) low = mid
    else high = mid - 1
  }
  return low
}

/**
 * Returns the playback state of a step of a track.
 *
 * @param index - The index of the step in the segments of its track.
 * @param current - The index of the step that plays in the track: {@link segmentIndexAt} for the main track, or
 *     {@link sideIndexAt} for a side path.
 */
export function stepState(index: number, current: number): 'done' | 'active' | 'pending' {
  return index < current ? 'done' : index === current ? 'active' : 'pending'
}

/** The place of a segment in a timeline. */
export interface SegmentPlace {
  segment: TimelineSegment
  /** The side path that holds the step, or `null` for a step of the main track. */
  side: SideTrack | null
  /** The main timeline, or the {@link sideView} of the side path. */
  view: Timeline
  /** The index of the segment in `view.segments`. */
  index: number
}

/** Finds the segment of a step in the main track and in the side tracks of a timeline. */
export function findSegment(timeline: Timeline, stepId: string): SegmentPlace | null {
  const main = timeline.segments.findIndex((segment) => segment.step.id === stepId)
  if (main !== -1) return { segment: timeline.segments[main]!, side: null, view: timeline, index: main }
  for (const side of timeline.sides) {
    const index = side.segments.findIndex((segment) => segment.step.id === stepId)
    if (index !== -1) return { segment: side.segments[index]!, side, view: sideView(timeline, side), index: index + 1 }
  }
  return null
}

/** Returns the segments of all tracks of a timeline: the main track, then each side track. */
export function allSegments(timeline: Timeline): TimelineSegment[] {
  return [...timeline.segments, ...timeline.sides.flatMap((side) => side.segments)]
}

/**
 * Returns the timeline that the flow camera follows: the main segments, cut where a side step starts or ends. Each
 * piece has the lanes of its main segment and the lanes of the side steps at that time, so the camera frames them all.
 * After the main track ends, its last segment goes on while side steps play. The `index` of each piece is the index
 * of its main segment.
 *
 * @returns The timeline itself if it has no side steps.
 */
export function cameraTimeline(timeline: Timeline): Timeline {
  const sides = timeline.sides.filter((side) => side.segments.length > 0)
  const { segments } = timeline
  if (sides.length === 0 || segments.length === 0) return timeline
  const cached = cameraTimelines.get(timeline)
  if (cached) return cached

  const endMs = Math.max(segments.at(-1)!.endMs, ...sides.map((side) => side.segments.at(-1)!.endMs))
  const cuts = new Set([...segments.map((segment) => segment.startMs), endMs])
  for (const side of sides) {
    for (const segment of side.segments) cuts.add(segment.startMs).add(segment.endMs)
  }
  const times = [...cuts].toSorted((a, b) => a - b)
  const pieces: TimelineSegment[] = []
  for (let i = 0; i + 1 < times.length; i++) {
    const startMs = times[i]!
    const main = segments[segmentIndexAt(timeline, startMs)]!
    const sideLanes = sides.flatMap(
      (side) => side.segments.find((segment) => segment.startMs <= startMs && startMs < segment.endMs)?.lanes ?? [],
    )
    pieces.push({ ...main, startMs, endMs: times[i + 1]!, lanes: [...main.lanes, ...sideLanes] })
  }
  const result = { ...timeline, segments: pieces }
  cameraTimelines.set(timeline, result)
  return result
}
