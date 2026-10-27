import { use, useSyncExternalStore } from 'react'
import type { Engine, PlaybackSnapshot } from './engine'
import { EngineContext } from './engine-context'

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
