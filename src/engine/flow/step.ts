import type { Engine } from '../engine'
import { segmentIndexAt, type TimelineSegment } from './compile'

/** The point in an edge step where a paused flow shows it, as a share of the step time. */
const EDGE_STEP_MOMENT = 0.6

function stepMoment(segment: TimelineSegment): number {
  if (segment.target.kind === 'node') return segment.startMs + 1
  return segment.startMs + (segment.endMs - segment.startMs) * EDGE_STEP_MOMENT
}

/** Pauses the flow and moves the playhead to the next or the previous step. An edge step shows its token on the way. */
export function stepFlow(engine: Engine, direction: 1 | -1) {
  const timeline = engine.playback.timeline
  if (!timeline || timeline.segments.length === 0) return
  const current = segmentIndexAt(timeline, engine.playback.time.get())
  const target = timeline.segments[current + direction]
  engine.playback.pause()
  engine.playback.seek(target ? stepMoment(target) : direction > 0 ? engine.playback.durationMs : 0)
}
