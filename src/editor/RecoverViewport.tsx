import { useNodesInitialized, useReactFlow, useStoreApi } from '@xyflow/react'
import { useEffect, useRef } from 'react'
import { editorFit } from './fit'

/**
 * Fits the diagram to the screen after the first measurement.
 *
 * The component does this only if the saved viewport shows no node.
 */
export function RecoverViewport() {
  const initialized = useNodesInitialized()
  const store = useStoreApi()
  const { fitView } = useReactFlow()
  const checked = useRef(false)

  useEffect(() => {
    if (!initialized || checked.current) return
    checked.current = true
    const { width, height, transform, nodeLookup } = store.getState()
    const [x, y, zoom] = transform
    const left = -x / zoom
    const top = -y / zoom
    const right = left + width / zoom
    const bottom = top + height / zoom
    for (const node of nodeLookup.values()) {
      const { x: nodeX, y: nodeY } = node.internals.positionAbsolute
      const nodeRight = nodeX + (node.measured.width ?? 0)
      const nodeBottom = nodeY + (node.measured.height ?? 0)
      if (nodeRight > left && nodeX < right && nodeBottom > top && nodeY < bottom) return
    }
    if (nodeLookup.size > 0) void fitView(editorFit())
  }, [initialized, store, fitView])

  return null
}
