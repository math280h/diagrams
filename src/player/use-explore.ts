import { useReactFlow, useStoreApi, type NodeMouseHandler } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CAPTION_HEIGHT_PX } from '@/canvas/FlowOverlay'
import { prefersReducedMotion } from '@/lib/motion'
import { unionRects, type Rect } from '@/model/rect'
import type { DiagramEdge, DiagramNode } from '@/model/types'

const FOCUS_DURATION_MS = 500
const FOCUS_PADDING_PX = 64
const FOCUS_MAX_ZOOM = 1.2

interface Link {
  edgeId: string
  nodeId: string
  outgoing: boolean
  label: string
}

/** Returns true for a node that Explore can focus: a card or a shape. */
export function explorable(node: DiagramNode | undefined): node is DiagramNode {
  return !!node && node.type !== 'group' && node.type !== 'text'
}

function busiestNode(nodes: DiagramNode[], edges: DiagramEdge[]): string | null {
  const degree = new Map<string, number>()
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1)
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1)
  }
  let best: string | null = null
  for (const node of nodes) {
    if (!explorable(node)) continue
    if (best === null || (degree.get(node.id) ?? 0) > (degree.get(best) ?? 0)) best = node.id
  }
  return best
}

/**
 * Returns the state of the Explore mode of Present: one node in focus, its neighbours, and the classes that dim the
 * rest. The camera frames the node and its neighbours above the strip at the bottom.
 *
 * @param topInsetPx - The screen pixels at the top that a bar covers.
 */
export function useExplore(nodes: DiagramNode[], edges: DiagramEdge[], topInsetPx: number) {
  const [focusId, setFocusId] = useState<string | null>(null)
  const { setViewport, getInternalNode } = useReactFlow()
  const store = useStoreApi()
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes])

  const links = useMemo<Link[]>(() => {
    if (!focusId) return []
    return edges.flatMap<Link>((edge) => {
      const label = edge.data?.label ?? ''
      if (edge.source === focusId) return [{ edgeId: edge.id, nodeId: edge.target, outgoing: true, label }]
      if (edge.target === focusId) return [{ edgeId: edge.id, nodeId: edge.source, outgoing: false, label }]
      return []
    })
  }, [edges, focusId])

  const near = useMemo(() => new Set(focusId ? [focusId, ...links.map((link) => link.nodeId)] : []), [focusId, links])
  const nearEdges = useMemo(() => new Set(links.map((link) => link.edgeId)), [links])

  const shownNodes = useMemo(
    () =>
      focusId
        ? nodes.map((node) =>
            near.has(node.id)
              ? { ...node, className: node.id === focusId ? 'dg-explore-near dg-explore-focus' : 'dg-explore-near' }
              : node,
          )
        : nodes,
    [nodes, near, focusId],
  )
  const shownEdges = useMemo(
    () =>
      focusId
        ? edges.map((edge) => (nearEdges.has(edge.id) ? { ...edge, className: 'dg-explore-near' } : edge))
        : edges,
    [edges, nearEdges, focusId],
  )

  useEffect(() => {
    if (!focusId) return
    const rects: Rect[] = []
    for (const id of near) {
      const internal = getInternalNode(id)
      if (!internal) continue
      const { x, y } = internal.internals.positionAbsolute
      rects.push({ x, y, width: internal.measured.width ?? 0, height: internal.measured.height ?? 0 })
    }
    const bounds = unionRects(rects)
    if (!bounds) return
    const { width, height } = store.getState()
    const freeHeight = Math.max(1, height - topInsetPx - CAPTION_HEIGHT_PX)
    const zoom = Math.min(
      FOCUS_MAX_ZOOM,
      (width - FOCUS_PADDING_PX * 2) / Math.max(1, bounds.width),
      (freeHeight - FOCUS_PADDING_PX * 2) / Math.max(1, bounds.height),
    )
    void setViewport(
      {
        x: width / 2 - (bounds.x + bounds.width / 2) * zoom,
        y: topInsetPx + freeHeight / 2 - (bounds.y + bounds.height / 2) * zoom,
        zoom,
      },
      { duration: prefersReducedMotion() ? 0 : FOCUS_DURATION_MS },
    )
  }, [focusId, near, getInternalNode, setViewport, store, topInsetPx])

  const start = useCallback(() => setFocusId((current) => current ?? busiestNode(nodes, edges)), [nodes, edges])
  const stop = useCallback(() => setFocusId(null), [])
  const onNodeClick = useCallback<NodeMouseHandler<DiagramNode>>(
    (_, node) => {
      if (focusId && explorable(node)) setFocusId(node.id)
    },
    [focusId],
  )

  return {
    active: focusId !== null,
    focus: focusId ? (byId.get(focusId) ?? null) : null,
    links,
    byId,
    nodes: shownNodes,
    edges: shownEdges,
    start,
    stop,
    setFocus: setFocusId,
    onNodeClick,
  }
}
