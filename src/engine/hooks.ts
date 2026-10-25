import { use, useSyncExternalStore } from 'react'
import type { Engine } from './engine'
import { EngineContext } from './engine-context'

export function useEngine(): Engine {
  const engine = use(EngineContext)
  if (!engine) throw new Error('useEngine needs an EngineProvider')
  return engine
}

export function usePlaybackState() {
  const engine = useEngine()
  useSyncExternalStore(engine.playback.subscribe, engine.playback.getVersion)
  return engine.playback
}

export function useCaption() {
  const engine = useEngine()
  return useSyncExternalStore(engine.subscribeCaption, engine.getCaption)
}
