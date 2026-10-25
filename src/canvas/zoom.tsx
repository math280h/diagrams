import { useStoreApi } from '@xyflow/react'
import { useEffect } from 'react'

const ICON_SELECTOR = '.dg-card-icon, .dg-group-icon'
const SETTLE_MS = 150
const ZOOM_STEP = Math.log(1.05)

/** Rounds the zoom to steps of 5 %. Icons only grow below 100 %, so a larger zoom gives 1. */
function iconZoom(zoom: number): string {
  if (zoom >= 1) return '1'
  return Math.exp(Math.round(Math.log(zoom) / ZOOM_STEP) * ZOOM_STEP).toFixed(4)
}

/**
 * Sets `--dg-zoom` on the canvas icons to the zoom of the React Flow viewport.
 *
 * Icons that mount later get the value at most {@link SETTLE_MS} after the zoom stops.
 *
 * Put this component inside the `ReactFlow` element.
 */
export function ZoomProperty({ rootRef }: { rootRef: React.RefObject<HTMLElement | null> }) {
  const store = useStoreApi()

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let written = iconZoom(store.getState().transform[2])
    let settleTimer: ReturnType<typeof setTimeout> | undefined
    root.style.setProperty('--dg-zoom', written)
    const unsubscribe = store.subscribe((state) => {
      const next = iconZoom(state.transform[2])
      if (next === written) return
      written = next
      for (const icon of root.querySelectorAll<HTMLElement | SVGElement>(ICON_SELECTOR)) {
        icon.style.setProperty('--dg-zoom', next)
      }
      clearTimeout(settleTimer)
      settleTimer = setTimeout(() => root.style.setProperty('--dg-zoom', next), SETTLE_MS)
    })
    return () => {
      unsubscribe()
      clearTimeout(settleTimer)
    }
  }, [store, rootRef])

  return null
}
