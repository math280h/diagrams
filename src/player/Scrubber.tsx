import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { useEngine, usePlaybackState } from '@/engine/hooks'
import { cn } from '@/lib/utils'

export function Scrubber() {
  const engine = useEngine()
  const playback = usePlaybackState()
  const headRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const duration = playback.durationMs
  const segments = playback.timeline?.segments ?? []

  useEffect(() => {
    const write = (time: number) => {
      if (headRef.current) headRef.current.style.left = `${duration > 0 ? (time / duration) * 100 : 0}%`
    }
    write(engine.playback.time.get())
    return engine.playback.time.on('change', write)
  }, [engine, duration])

  const seekFromPointer = (event: ReactPointerEvent) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || duration <= 0) return
    engine.playback.seek(((event.clientX - rect.left) / rect.width) * duration)
  }

  return (
    <div
      ref={trackRef}
      className="relative h-5 flex-1 cursor-pointer touch-none"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        engine.playback.pause()
        seekFromPointer(event)
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) seekFromPointer(event)
      }}
    >
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted" />
      {duration > 0 &&
        segments.map((segment) => (
          <div
            key={segment.step.id}
            className={cn(
              'absolute top-1/2 h-2.5 w-px -translate-y-1/2',
              segment.step.target.kind === 'node' ? 'bg-foreground/35' : 'bg-foreground/12',
            )}
            style={{ left: `${(segment.startMs / duration) * 100}%` }}
          />
        ))}
      <div
        ref={headRef}
        className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground ring-2 ring-panel"
      />
    </div>
  )
}
