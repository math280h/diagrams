import { getNodesBounds, useReactFlow, useStore, useStoreApi } from '@xyflow/react'
import { useEffect, useState, type ReactNode } from 'react'
import { useReducedMotion } from '@/lib/motion'
import type { Rect } from './camera'
import { Engine } from './engine'
import { EngineContext } from './engine-context'
import { useEngine } from './hooks'
import { usePageVisible } from './page-visible'

/**
 * Gives an engine to the components inside and runs its frame loop. The loop also pauses while nobody can see the page.
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
  const visible = usePageVisible()
  useEffect(() => {
    if (!running || !visible) {
      engine.pause()
      return
    }
    engine.start()
    return () => engine.stop()
  }, [engine, running, visible])
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
    let labels: { key: unknown[]; rects: Rect[] } | null = null
    const labelRects = (): Rect[] => {
      const layer = root.querySelector<HTMLElement>('.react-flow__viewport')
      if (!layer || layer.offsetWidth === 0) return []
      const elements = layer.querySelectorAll('.dg-edge-label, .dg-group-label')
      const { nodeLookup, edges } = store.getState()
      const key = [nodeLookup, edges, elements.length, root.dataset.lod]
      if (labels?.key.every((part, index) => part === key[index])) return labels.rects
      const frame = layer.getBoundingClientRect()
      const scale = frame.width / layer.offsetWidth
      const rects = Array.from(elements, (element) => {
        const box = element.getBoundingClientRect()
        return {
          x: (box.left - frame.left) / scale,
          y: (box.top - frame.top) / scale,
          width: box.width / scale,
          height: box.height / scale,
        }
      })
      labels = { key, rects }
      return rects
    }
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
        texts() {
          const rects: Rect[] = []
          for (const node of store.getState().nodeLookup.values()) {
            if (node.type !== 'text' || node.hidden) continue
            const { x, y } = node.internals.positionAbsolute
            rects.push({ x, y, width: node.measured.width ?? 0, height: node.measured.height ?? 0 })
          }
          return rects
        },
        nodes() {
          const rects: Rect[] = []
          for (const node of store.getState().nodeLookup.values()) {
            if (node.type === 'group' || node.hidden) continue
            const { x, y } = node.internals.positionAbsolute
            rects.push({ x, y, width: node.measured.width ?? 0, height: node.measured.height ?? 0 })
          }
          return [...rects, ...labelRects()]
        },
      },
    })
    const unsubscribe = store.subscribe((state, previous) => {
      if (state.nodeLookup !== previous.nodeLookup || state.edges !== previous.edges) engine.invalidate()
      if (state.transform !== previous.transform) engine.placeCallouts()
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
