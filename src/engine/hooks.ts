import { use, useEffect, useState, useSyncExternalStore } from 'react'
import type { Engine, PlaybackSnapshot } from './engine'
import { EngineContext } from './engine-context'
import { segmentIndexAt } from './flow/compile'

export function useEngine(): Engine {
  const engine = use(EngineContext)
  if (!engine) throw new Error('useEngine needs an EngineProvider')
  return engine
}

export function usePlaybackState(): PlaybackSnapshot {
  const engine = useEngine()
  return useSyncExternalStore(engine.playback.subscribe, engine.playback.getSnapshot)
}

export function useCaption() {
  const engine = useEngine()
  return useSyncExternalStore(engine.subscribeCaption, engine.getCaption)
}

/** Returns the index of the timeline segment at the playback time, or -1 without a timeline. */
export function useSegmentIndex(): number {
  const engine = useEngine()
  const [index, setIndex] = useState(-1)
  useEffect(() => {
    const update = (time: number) => {
      const timeline = engine.playback.timeline
      setIndex(timeline ? segmentIndexAt(timeline, time) : -1)
    }
    update(engine.playback.time.get())
    return engine.playback.time.on('change', update)
  }, [engine, engine.playback.timeline])
  return index
}
