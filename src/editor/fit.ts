import { useReactFlow } from '@xyflow/react'
import { useCallback } from 'react'

export const NARROW_SCREEN_PX = 768
export const NARROW_MIN_ZOOM = 0.5

const FIT_DURATION_MS = 400

export function editorFit() {
  const narrow = typeof window !== 'undefined' && window.innerWidth < NARROW_SCREEN_PX
  return { padding: '48px', maxZoom: 1.1, minZoom: narrow ? NARROW_MIN_ZOOM : undefined } as const
}

export function useFitToScreen() {
  const { fitView } = useReactFlow()
  return useCallback(() => void fitView({ ...editorFit(), duration: FIT_DURATION_MS }), [fitView])
}
