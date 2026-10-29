import { useReactFlow, useStore } from '@xyflow/react'
import { useCallback } from 'react'
import { lanesText, overviewName, type LaneName } from '@/model/flow'
import { nodeName } from '@/model/labels'
import { stepBody } from '@/model/payload'
import type { EdgeData } from '@/model/schema'
import { useCaption, useEngine, usePlaybackState } from '@/engine/hooks'
import type { DiagramEdge, DiagramNode } from '@/model/types'
import { Icon } from './icon'

export function FlowToken() {
  const engine = useEngine()
  const playback = usePlaybackState()
  const token = playback.timeline?.flow.token
  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      engine.setTokenElement(element)
      return () => engine.setTokenElement(null)
    },
    [engine],
  )

  if (!token) return null
  return (
    <div ref={ref} className="dg-token" style={{ display: 'none', zIndex: 3000 }}>
      <div className="dg-token-dot" />
      {token.shape === 'chip' && (
        <div className="dg-token-chip">
          {token.icon && (
            <span className="dg-token-avatar">
              <Icon name={token.icon} strokeWidth={2.25} />
            </span>
          )}
          {token.label}
        </div>
      )}
    </div>
  )
}

function nodeTitle(node: DiagramNode | undefined): string {
  return node ? nodeName(node) : ''
}

export const CAPTION_HEIGHT_PX = 48

export function FlowCaption() {
  const caption = useCaption()
  const { getNode, getEdge } = useReactFlow<DiagramNode, DiagramEdge>()
  const edgeId = caption?.target.kind === 'edge' ? caption.target.id : null
  const edgeData = useStore((state) =>
    edgeId ? (state.edgeLookup.get(edgeId)?.data as EdgeData | undefined) : undefined,
  )
  if (!caption) return null
  const body = caption.bodies && edgeId ? stepBody(edgeData, caption.reversed) : ''

  const lanes = caption.lanes.flatMap(({ target, reversed }): LaneName[] => {
    if (target.kind === 'node') return [{ kind: 'node', from: nodeTitle(getNode(target.id)), to: '' }]
    const edge = getEdge(target.id)
    if (!edge) return []
    const from = nodeTitle(getNode(reversed ? edge.target : edge.source))
    return [{ kind: 'edge', from, to: nodeTitle(getNode(reversed ? edge.source : edge.target)) }]
  })
  const element = caption.target.kind === 'flow' ? overviewName(caption.index, caption.total) : lanesText(lanes)
  const event = caption.event || (caption.target.kind === 'edge' ? (getEdge(caption.target.id)?.data?.label ?? '') : '')

  return (
    <div className="dg-caption">
      <span className="dg-caption-step dg-mono">
        {caption.index + 1}/{caption.total}
      </span>
      <span className="dg-caption-element">{element}</span>
      {event && (
        <span className="dg-caption-event dg-mono" data-level={caption.level}>
          {event}
        </span>
      )}
      {body && <span className="dg-caption-body dg-mono">{body}</span>}
      {caption.text && <span className="dg-caption-text">{caption.text}</span>}
    </div>
  )
}
