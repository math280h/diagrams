import { useStoreApi } from '@xyflow/react'
import { useEffect } from 'react'

const FAR_ZOOM = 0.55
const FARTHER_ZOOM = 0.3

function levelOfDetail(zoom: number): 'far' | 'farther' | null {
  if (zoom < FARTHER_ZOOM) return 'farther'
  if (zoom < FAR_ZOOM) return 'far'
  return null
}

/**
 * Sets `data-lod` on the canvas root: `far` below zoom 0.55 and `farther` below 0.3.
 *
 * Put this component inside the `ReactFlow` element.
 */
export function LevelOfDetail({ rootRef }: { rootRef: React.RefObject<HTMLElement | null> }) {
  const store = useStoreApi()

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const write = (zoom: number) => {
      const level = levelOfDetail(zoom)
      if (level) root.dataset.lod = level
      else delete root.dataset.lod
    }
    write(store.getState().transform[2])
    const unsubscribe = store.subscribe((state, previous) => {
      if (levelOfDetail(state.transform[2]) !== levelOfDetail(previous.transform[2])) write(state.transform[2])
    })
    return () => {
      unsubscribe()
      delete root.dataset.lod
    }
  }, [store, rootRef])

  return null
}
