import { useReactFlow, useStore } from '@xyflow/react'
import { useCallback, useLayoutEffect } from 'react'
import { lanesText, overviewName, type LaneName } from '@/model/flow'
import { nodeName } from '@/model/labels'
import { stepBody } from '@/model/payload'
import type { CaptionStyle, EdgeData, LogLevel } from '@/model/schema'
import { calloutKey, type Caption, type SideCaption } from '@/engine/engine'
import { useCaption, useEngine, usePlaybackState } from '@/engine/hooks'
import type { DiagramEdge, DiagramNode } from '@/model/types'
import { cn } from '@/lib/utils'
import { useNoticesBelow } from '@/components/notice-space'
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

interface CalloutProps {
  cardKey: string
  number: string
  /** The name of the side path of the step. */
  path?: string
  heading: string
  mono: boolean
  level: LogLevel
  text: string
  body: string
}

function Callout({ cardKey, number, path, heading, mono, level, text, body }: CalloutProps) {
  const engine = useEngine()
  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      engine.setCalloutElement(cardKey, element)
      return () => engine.setCalloutElement(cardKey, null)
    },
    [engine, cardKey],
  )
  return (
    <div ref={ref} className="dg-callout">
      <div className="dg-callout-head">
        <span className="dg-callout-step dg-mono">{number}</span>
        {path && <span className="dg-callout-path">{path}</span>}
        {heading && (
          <span className={cn('dg-callout-heading', mono && 'dg-mono')} data-level={level}>
            {heading}
          </span>
        )}
      </div>
      {text && <p className="dg-callout-text">{text}</p>}
      {body && <p className="dg-callout-body dg-mono">{body}</p>}
    </div>
  )
}

/**
 * Shows the caption of the current step and of the side steps that play at the time, each in its caption style: a
 * card next to the step, a subtitle, or a bar at the bottom or the top of the view.
 *
 * @param exportMode - If true, notices do not move below a caption bar at the top.
 */
export function FlowCaption({ exportMode = false }: { exportMode?: boolean }) {
  const engine = useEngine()
  const caption = useCaption()
  const noticesBelow = useNoticesBelow()
  const { getNode, getEdge } = useReactFlow<DiagramNode, DiagramEdge>()
  const edgeId = caption?.target.kind === 'edge' ? caption.target.id : null
  const edgeData = useStore((state) =>
    edgeId ? (state.edgeLookup.get(edgeId)?.data as EdgeData | undefined) : undefined,
  )
  useLayoutEffect(() => engine.refreshCallouts())
  if (!caption) return null
  const body = caption.bodies && edgeId ? stepBody(edgeData, caption.reversed) : ''

  const elementOf = (lanes: Caption['lanes']) =>
    lanesText(
      lanes.flatMap(({ target, reversed }): LaneName[] => {
        if (target.kind === 'node') return [{ kind: 'node', from: nodeTitle(getNode(target.id)), to: '' }]
        const edge = getEdge(target.id)
        if (!edge) return []
        const from = nodeTitle(getNode(reversed ? edge.target : edge.source))
        return [{ kind: 'edge', from, to: nodeTitle(getNode(reversed ? edge.source : edge.target)) }]
      }),
    )
  const element = caption.target.kind === 'flow' ? overviewName(caption.index, caption.total) : elementOf(caption.lanes)
  const event = caption.event || (caption.target.kind === 'edge' ? (getEdge(caption.target.id)?.data?.label ?? '') : '')
  const sideEvent = (side: SideCaption) => {
    const main = side.lanes[0]?.target
    return side.event || (main?.kind === 'edge' ? (getEdge(main.id)?.data?.label ?? '') : '')
  }
  const sidesIn = (style: CaptionStyle) => caption.sides.filter((side) => side.style === style)

  const bar = (place: 'bottom' | 'top') => {
    const sides = sidesIn(place)
    if (caption.style !== place && sides.length === 0) return null
    return (
      <div ref={place === 'top' && !exportMode ? noticesBelow : undefined} className="dg-caption" data-place={place}>
        {caption.style === place && (
          <>
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
          </>
        )}
        {sides.map((side) => {
          const text = sideEvent(side)
          return (
            <span key={side.track} className="dg-caption-side">
              <span className="dg-mono">{side.number}</span> {side.name}: {elementOf(side.lanes)}
              {text && <span className="dg-mono"> {text}</span>}
              {side.text && ` — ${side.text}`}
            </span>
          )
        })}
      </div>
    )
  }

  const subtitleSides = sidesIn('subtitle')
  return (
    <div className="dg-captions">
      {bar('bottom')}
      {bar('top')}
      {(caption.style === 'subtitle' || subtitleSides.length > 0) && (
        <div className="dg-subtitle">
          {caption.style === 'subtitle' && (
            <p className="dg-subtitle-main">
              {caption.text || (
                <>
                  {element}
                  {event && (
                    <span className="dg-subtitle-event dg-mono" data-level={caption.level}>
                      {event}
                    </span>
                  )}
                </>
              )}
            </p>
          )}
          {subtitleSides.map((side) => (
            <p key={side.track} className="dg-subtitle-side">
              <span className="dg-mono">{side.number}</span> {side.name}: {side.text || elementOf(side.lanes)}
            </p>
          ))}
        </div>
      )}
      {caption.style === 'callout' && (
        <Callout
          cardKey={calloutKey(null)}
          number={`${caption.index + 1}/${caption.total}`}
          heading={event || element}
          mono={event !== ''}
          level={caption.level}
          text={caption.text}
          body={body}
        />
      )}
      {sidesIn('callout').map((side) => {
        const text = sideEvent(side)
        return (
          <Callout
            key={side.track}
            cardKey={calloutKey(side.track)}
            number={side.number}
            path={side.name}
            heading={text || elementOf(side.lanes)}
            mono={text !== ''}
            level="info"
            text={side.text}
            body=""
          />
        )
      })}
    </div>
  )
}
