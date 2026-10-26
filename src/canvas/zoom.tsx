import { useStoreApi } from '@xyflow/react'
import { useEffect } from 'react'
import { iconZoom, ZOOM_SCOPE_SELECTOR } from './zoom-scope'

/**
 * Sets `--dg-zoom` on the icon scopes of the canvas (`useZoomScopeRef`) to the zoom of the React Flow viewport.
 *
 * Put this component inside the `ReactFlow` element.
 */
export function ZoomProperty({ rootRef }: { rootRef: React.RefObject<HTMLElement | null> }) {
  const store = useStoreApi()

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let written = iconZoom(store.getState().transform[2])
    return store.subscribe((state) => {
      const next = iconZoom(state.transform[2])
      if (next === written) return
      written = next
      for (const scope of root.querySelectorAll<HTMLElement>(ZOOM_SCOPE_SELECTOR)) {
        scope.style.setProperty('--dg-zoom', next)
      }
    })
  }, [store, rootRef])

  return null
}
