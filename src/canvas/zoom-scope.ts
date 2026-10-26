import { useStoreApi } from '@xyflow/react'
import { useCallback } from 'react'

export const ZOOM_SCOPE_SELECTOR = '.dg-zoom-scope'
const ZOOM_STEP = Math.log(1.05)

/** Rounds the zoom to steps of 5 %. Icons only grow below 100 %, so a larger zoom gives 1. */
export function iconZoom(zoom: number): string {
  if (zoom >= 1) return '1'
  return Math.exp(Math.round(Math.log(zoom) / ZOOM_STEP) * ZOOM_STEP).toFixed(4)
}

/**
 * Returns a ref for an element around canvas icons, which keep a minimum size on screen. The element gets
 * `--dg-zoom` when it mounts, and `ZoomProperty` changes it with the zoom.
 */
export function useZoomScopeRef() {
  const store = useStoreApi()
  return useCallback(
    (element: HTMLElement | null) => {
      element?.style.setProperty('--dg-zoom', iconZoom(store.getState().transform[2]))
    },
    [store],
  )
}
