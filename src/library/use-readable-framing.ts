import { getNodesBounds, useNodesInitialized, useReactFlow, useStore, useStoreApi } from '@xyflow/react'
import { useEffect, useState } from 'react'
import type { Rect } from '@/engine/camera'
import { readableViewport } from './framing'

export interface FramingOptions {
  edges: readonly { source: string; target: string }[]
  paddingPx: number
  minZoom: number
  maxZoom: number
  /** The screen pixels at the bottom of the view that a caption strip covers. */
  bottomInsetPx?: number
  /** If true, the hook frames the diagram one time and does not follow later size changes. */
  once?: boolean
  /** If true, the whole diagram includes its text nodes, such as the title. */
  withText?: boolean
}

/**
 * Sets the viewport of the React Flow instance around it to the {@link readableViewport} after the fonts load and React
 * Flow measures the nodes, and again when the measured sizes change.
 *
 * @returns True after the first viewport change.
 */
export function useReadableFraming({
  edges,
  paddingPx,
  minZoom,
  maxZoom,
  bottomInsetPx = 0,
  once = false,
  withText = false,
}: FramingOptions) {
  const initialized = useNodesInitialized()
  const store = useStoreApi()
  const { setViewport } = useReactFlow()
  const width = useStore((state) => state.width)
  const height = useStore((state) => state.height)
  const [framed, setFramed] = useState(false)
  const [fontsReady, setFontsReady] = useState(false)
  const measuredSize = useStore((state) => {
    let total = 0
    for (const node of state.nodeLookup.values()) total += (node.measured.width ?? 0) + (node.measured.height ?? 0)
    return total
  })

  useEffect(() => {
    let cancelled = false
    void document.fonts.ready.then(() => {
      if (!cancelled) setFontsReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!fontsReady || !initialized || measuredSize === 0 || width === 0 || height === 0 || (once && framed)) return
    const { nodes, nodeLookup } = store.getState()
    const framedNodes = withText ? nodes : nodes.filter((node) => node.type !== 'text')
    const bounds = getNodesBounds(framedNodes.length > 0 ? framedNodes : nodes, { nodeLookup })
    const rects = new Map<string, Rect>()
    for (const [id, node] of nodeLookup) {
      if (node.type === 'group' || node.type === 'text') continue
      rects.set(id, {
        ...node.internals.positionAbsolute,
        width: node.measured.width ?? 0,
        height: node.measured.height ?? 0,
      })
    }
    void setViewport(
      readableViewport({
        bounds,
        rects,
        edges,
        view: { width, height: height - bottomInsetPx },
        paddingPx,
        minZoom,
        maxZoom,
      }),
    )
    const frame = requestAnimationFrame(() => setFramed(true))
    return () => cancelAnimationFrame(frame)
  }, [
    fontsReady,
    initialized,
    measuredSize,
    width,
    height,
    store,
    setViewport,
    edges,
    paddingPx,
    minZoom,
    maxZoom,
    bottomInsetPx,
    once,
    withText,
    framed,
  ])

  return framed
}
