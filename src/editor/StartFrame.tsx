import { getNodesBounds, useNodesInitialized, useReactFlow, useStoreApi } from '@xyflow/react'
import { useEffect, useRef } from 'react'
import { editorFit, NARROW_MIN_ZOOM } from './fit'

const START_PADDING_PX = 24

/**
 * Frames the diagram one time on a narrow screen.
 *
 * If the diagram does not fit at {@link NARROW_MIN_ZOOM}, the view shows its top left corner at that
 * zoom.
 */
export function StartFrame() {
  const initialized = useNodesInitialized()
  const store = useStoreApi()
  const { setViewport, fitView } = useReactFlow()
  const framed = useRef(false)

  useEffect(() => {
    if (!initialized || framed.current) return
    const { nodes, nodeLookup, width, height } = store.getState()
    if (nodes.length === 0 || width === 0) return
    framed.current = true
    const bounds = getNodesBounds(nodes, { nodeLookup })
    const fitZoom = Math.min(
      (width - START_PADDING_PX * 2) / Math.max(1, bounds.width),
      (height - START_PADDING_PX * 2) / Math.max(1, bounds.height),
    )
    if (fitZoom >= NARROW_MIN_ZOOM) {
      void fitView(editorFit())
      return
    }
    void setViewport({
      x: START_PADDING_PX - bounds.x * NARROW_MIN_ZOOM,
      y: START_PADDING_PX - bounds.y * NARROW_MIN_ZOOM,
      zoom: NARROW_MIN_ZOOM,
    })
  }, [initialized, store, setViewport, fitView])

  return null
}
