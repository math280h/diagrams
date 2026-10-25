import { getNodesBounds, useReactFlow, useStore, useStoreApi } from '@xyflow/react'
import { useEffect, useState, type ReactNode } from 'react'
import { useReducedMotion } from '@/lib/motion'
import { Engine } from './engine'
import { EngineContext } from './engine-context'
import { useEngine } from './hooks'

/**
 * Gives an engine to the components inside and runs its frame loop.
 *
 * @param running - If false, the frame loop pauses after one last render.
 */
export function EngineProvider({
  children,
  engine: given,
  running = true,
}: {
  children: ReactNode
  engine?: Engine
  running?: boolean
}) {
  const [engine] = useState(() => given ?? new Engine())
  useEffect(() => {
    if (!running) {
      engine.pause()
      return
    }
    engine.start()
    return () => engine.stop()
  }, [engine, running])
  const reducedMotion = useReducedMotion()
  useEffect(() => {
    if (!engine.manual) engine.setReducedMotion(reducedMotion)
  }, [engine, reducedMotion])
  return <EngineContext value={engine}>{children}</EngineContext>
}

/**
 * Connects the engine to the React Flow instance around it.
 *
 * Put this component inside the `ReactFlow` element.
 */
export function EngineBinding({ rootRef }: { rootRef: React.RefObject<HTMLElement | null> }) {
  const engine = useEngine()
  const store = useStoreApi()
  const { setViewport } = useReactFlow()
  const width = useStore((state) => state.width)
  const height = useStore((state) => state.height)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    engine.attach({
      root,
      setViewport: (viewport) => void setViewport(viewport),
      getViewport: () => {
        const [x, y, zoom] = store.getState().transform
        return { x, y, zoom }
      },
      visibleRect: () => {
        const { transform, width: viewWidth, height: viewHeight } = store.getState()
        const [x, y, zoom] = transform
        return { x: -x / zoom, y: -y / zoom, width: viewWidth / zoom, height: viewHeight / zoom }
      },
      geometry: {
        nodeRect(id) {
          const node = store.getState().nodeLookup.get(id)
          if (!node) return null
          const { x, y } = node.internals.positionAbsolute
          return {
            x,
            y,
            width: node.measured.width ?? node.width ?? 0,
            height: node.measured.height ?? node.height ?? 0,
          }
        },
        edgeTable: (id) => engine.tables.get(id) ?? null,
        bounds() {
          const { nodes, nodeLookup } = store.getState()
          if (nodes.length === 0) return null
          return getNodesBounds(nodes, { nodeLookup })
        },
      },
    })
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.nodeLookup !== previous.nodeLookup || state.edges !== previous.edges) engine.invalidate()
    })
    return () => {
      unsubscribe()
      engine.detach()
    }
  }, [engine, store, setViewport, rootRef])

  useEffect(() => {
    engine.setView({ width, height })
  }, [engine, width, height])

  return null
}
