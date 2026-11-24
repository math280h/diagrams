import type { Timeline } from '@/engine/flow/compile'
import { stepCaptionStyle } from '@/model/flow'

/** The height of the caption bar in screen pixels. */
export const CAPTION_HEIGHT_PX = 48

/** The height in screen pixels at the bottom of the view for a subtitle with one line of text, with its margin. */
export const SUBTITLE_SPACE_PX = 92

/** The screen pixels at the top and at the bottom of the view that captions cover. */
export interface CaptionSpace {
  top: number
  bottom: number
}

/**
 * Returns the space that the captions of a timeline cover, from the caption styles of all its steps: a bar at the top
 * or at the bottom, or a subtitle. Callouts and hidden captions cover no space.
 */
export function captionSpace(timeline: Timeline | null): CaptionSpace {
  if (!timeline) return { top: 0, bottom: 0 }
  const segments = [...timeline.segments, ...timeline.sides.flatMap((side) => side.segments)]
  const styles = new Set(segments.map((segment) => stepCaptionStyle(timeline.flow, segment.step)))
  return {
    top: styles.has('top') ? CAPTION_HEIGHT_PX : 0,
    bottom: Math.max(styles.has('bottom') ? CAPTION_HEIGHT_PX : 0, styles.has('subtitle') ? SUBTITLE_SPACE_PX : 0),
  }
}
