import { usePlaybackState, useSegmentIndex } from '@/engine/hooks'
import { cn } from '@/lib/utils'

/** Shows the number of the step at the playback time and the number of steps of the flow. */
export function StepCount({ className }: { className?: string }) {
  const playback = usePlaybackState()
  const current = useSegmentIndex()
  const total = playback.timeline?.segments.length ?? 0
  if (total === 0) return null
  return (
    <span className={cn('text-xs whitespace-nowrap text-muted-foreground tabular-nums', className)}>
      Step <span className="text-foreground">{Math.max(0, current) + 1}</span> of {total}
    </span>
  )
}
