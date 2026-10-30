import { useInternalNode, useReactFlow, type EdgeProps } from '@xyflow/react'
import { ShieldAlert } from 'lucide-react'
import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { useEngine } from '@/engine/hooks'
import { hashUnit } from '@/engine/hash'
import { buildArcTable, pointAt } from '@/engine/path-sampler'
import { COMET_TRAIL, dashPattern, particleCount } from '@/engine/traffic'
import { defaultEdgeData } from '@/model/defaults'
import { snapToGrid } from '@/model/graph'
import { edgeProtocol } from '@/model/protocols'
import type { EdgeData, XY } from '@/model/schema'
import { crossingText } from '@/model/threats'
import type { DiagramEdge } from '@/model/types'
import { selectOnly, updateEdgeData } from '@/store/actions'
import { useCanvasMode } from '@/canvas/mode'
import { EditableText } from '@/canvas/nodes/EditableText'
import { EdgeLabelPortal, ViewportLayerPortal } from '@/canvas/portal'
import {
  autoEndpoints,
  bendsWithSegmentAt,
  edgePath,
  internalRect,
  manualRoute,
  middleSegments,
  positionSide,
  routePath,
  type EdgeEndpoints,
  type RouteSegment,
} from './geometry'
import { ROUTED_PATHS, useEdgeRoute } from './routing'

const FALLBACK_DATA = defaultEdgeData()
const ROUTE_RADIUS: Partial<Record<EdgeData['path'], number>> = { smooth: 12, step: 0 }
const RAD_TO_DEG = 180 / Math.PI

function Marker({ kind, x, y, angle }: { kind: 'arrow' | 'dot'; x: number; y: number; angle: number }) {
  if (kind === 'dot') return <circle className="dg-marker" cx={x} cy={y} r={3.2} />
  return (
    <path
      className="dg-marker"
      d="M0,0 L-8.5,-4.2 L-6.8,0 L-8.5,4.2 Z"
      transform={`translate(${x} ${y}) rotate(${angle * RAD_TO_DEG})`}
    />
  )
}

const LABEL_CHAR_PX = 6.8
const LABEL_PADDING_PX = 16
const LABEL_END_GAP_PX = 14

function labelFraction(label: string, position: number, lengthPx: number): number {
  if (!label || lengthPx <= 0) return position
  const margin = (label.length * LABEL_CHAR_PX + LABEL_PADDING_PX) / 2 + LABEL_END_GAP_PX
  const min = margin / lengthPx
  if (min >= 0.5) return 0.5
  return Math.min(1 - min, Math.max(min, position))
}

function bodyMark(requestFields: number, responseFields: number): string {
  const request = requestFields > 0 ? `{${requestFields}}` : ''
  const response = responseFields > 0 ? `→ {${responseFields}}` : ''
  return [request, response].filter(Boolean).join(' ')
}

function bodyTitle(requestFields: number, responseFields: number): string {
  const count = (fields: number) => (fields === 1 ? '1 field' : `${fields} fields`)
  return [
    requestFields > 0 ? `Request body: ${count(requestFields)}` : '',
    responseFields > 0 ? `Response body: ${count(responseFields)}` : '',
  ]
    .filter(Boolean)
    .join('. ')
}

function SegmentHandle({
  segment,
  route,
  snap,
  onDraft,
  onDrop,
}: {
  segment: RouteSegment
  route: readonly XY[]
  snap: boolean
  onDraft: (bends: XY[]) => void
  onDrop: () => void
}) {
  const { screenToFlowPosition } = useReactFlow()
  const start = useRef<readonly XY[] | null>(null)
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return
    const point = screenToFlowPosition({ x: event.clientX, y: event.clientY }, { snapToGrid: false })
    const at = snap ? snapToGrid(point[segment.axis]) : Math.round(point[segment.axis])
    onDraft(bendsWithSegmentAt(start.current, segment, at))
  }
  return (
    <div
      className="dg-route-handle nodrag nopan"
      data-axis={segment.axis}
      style={{ transform: `translate(${segment.middle.x}px, ${segment.middle.y}px)` }}
      onPointerDown={(event) => {
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        start.current = route
      }}
      onPointerMove={move}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture(event.pointerId)
        if (start.current) onDrop()
        start.current = null
      }}
    />
  )
}

export function FlowEdge(props: EdgeProps<DiagramEdge>) {
  const { id, source, target, data = FALLBACK_DATA, selected } = props
  const engine = useEngine()
  const { editable, threats, snap } = useCanvasMode()
  const threat = threats?.get(id)
  const crossing = threat !== undefined && threat.boundaries.length > 0 ? 'true' : undefined
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const trafficRef = useRef<SVGGElement>(null)
  const automatic = useEdgeRoute(id)
  const [draft, setDraft] = useState<XY[] | null>(null)

  const auto = data.sides === 'auto' && sourceNode && targetNode
  const ends: EdgeEndpoints = auto ? autoEndpoints(internalRect(sourceNode), internalRect(targetNode)) : props
  const orthogonal = ROUTED_PATHS.has(data.path)
  const bends = draft ?? data.bends
  const drawn =
    orthogonal && bends?.length && sourceNode && targetNode
      ? manualRoute(internalRect(sourceNode), internalRect(targetNode), bends)
      : undefined
  const route = drawn ?? (orthogonal ? automatic : undefined)
  const path =
    route && route.length >= 2 ? routePath(route, ROUTE_RADIUS[data.path] ?? 0) : edgePath(data.path, ends)[0]
  const table = useMemo(() => buildArcTable(path), [path])
  const segments = editable && selected && route ? middleSegments(route) : []

  useLayoutEffect(() => {
    engine.tables.set(id, table)
    engine.invalidate()
    return () => {
      engine.tables.delete(id)
    }
  }, [engine, id, table])

  const { traffic } = data
  const march = traffic.style === 'dashes' || traffic.style === 'pulse'
  const count = traffic.enabled && !march ? particleCount(traffic, table.lengthPx) : 0
  const pattern = march ? dashPattern(traffic, table.lengthPx) : null

  useLayoutEffect(() => {
    const group = trafficRef.current
    if (!group || !traffic.enabled) return
    engine.registerTraffic(id, {
      table,
      traffic,
      seed: hashUnit(id),
      count,
      elements: Array.from(group.children) as SVGElement[],
    })
    return () => engine.unregisterTraffic(id)
  }, [engine, id, table, traffic, count])

  const requestFields = data.request?.fields.length ?? 0
  const responseFields = data.response?.fields.length ?? 0
  const mark = bodyMark(requestFields, responseFields)
  const labelText = [data.label, mark].filter(Boolean).join(' ')

  const start = pointAt(table, 0)
  const end = pointAt(table, 1)
  const label = pointAt(table, labelFraction(labelText, data.labelPosition, table.lengthPx))
  const strokeWidth = data.width
  const protocol = edgeProtocol(data) ?? undefined

  return (
    <>
      <g className="dg-edge" data-protocol={protocol} data-sensitive={threat?.kind} data-crossing={crossing}>
        <path className="dg-edge-path" d={path} data-stroke={data.stroke} strokeWidth={strokeWidth} />
        <path className="react-flow__edge-interaction" d={path} fill="none" strokeOpacity={0} strokeWidth={18} />
        <g ref={trafficRef} className="dg-traffic" style={{ pointerEvents: 'none' }}>
          {traffic.enabled &&
            !march &&
            Array.from({ length: count }, (_, index) =>
              traffic.style === 'comets' ? (
                [
                  <circle key={`${index}-h`} className="dg-particle" r={traffic.size} cx={-1e5} cy={-1e5} />,
                  ...COMET_TRAIL.map((trail, k) => (
                    <circle
                      key={`${index}-${k}`}
                      className="dg-particle"
                      r={traffic.size * trail.scale}
                      cx={-1e5}
                      cy={-1e5}
                    />
                  )),
                ]
              ) : (
                <circle key={index} className="dg-particle" r={traffic.size} cx={-1e5} cy={-1e5} />
              ),
            )}
          {traffic.enabled && march && pattern && (
            <path
              className="dg-march"
              d={path}
              strokeWidth={traffic.style === 'pulse' ? traffic.size * 1.6 : traffic.size * 1.2}
              strokeDasharray={`${pattern.dash} ${pattern.gap}`}
            />
          )}
        </g>
        {data.markerStart !== 'none' && (
          <Marker kind={data.markerStart} x={start.x} y={start.y} angle={start.angleRad + Math.PI} />
        )}
        {data.markerEnd !== 'none' && <Marker kind={data.markerEnd} x={end.x} y={end.y} angle={end.angleRad} />}
      </g>

      {labelText && (
        <EdgeLabelPortal>
          <div
            className="dg-edge-label dg-mono nodrag nopan"
            data-dg-edge={id}
            data-protocol={protocol}
            data-selected={selected ? 'true' : undefined}
            data-sensitive={threat?.kind}
            data-crossing={crossing}
            style={{ transform: `translate(-50%, -50%) translate(${label.x}px, ${label.y}px)` }}
            onClick={() => editable && selectOnly([], [id])}
          >
            {data.label && (
              <EditableText
                value={data.label}
                editable={editable}
                onCommit={(value) => updateEdgeData(id, { label: value })}
                style={{ width: `${Math.max(2, data.label.length + 1)}ch` }}
              />
            )}
            {mark && (
              <span
                className="dg-edge-fields"
                data-after-label={data.label ? 'true' : undefined}
                title={bodyTitle(requestFields, responseFields)}
              >
                {mark}
              </span>
            )}
            {threat && (
              <span
                className="dg-edge-data"
                title={`${crossingText(threat).fields}. ${crossingText(threat).boundaries}`}
              >
                {crossing && <ShieldAlert aria-hidden />}
                {threat.kind}
              </span>
            )}
          </div>
        </EdgeLabelPortal>
      )}

      {segments.length > 0 && route && (
        <ViewportLayerPortal>
          {segments.map((segment) => (
            <SegmentHandle
              key={segment.index}
              segment={segment}
              route={route}
              snap={snap}
              onDraft={setDraft}
              onDrop={() => {
                if (draft) updateEdgeData(id, { bends: draft }, `edge-bends:${id}:${Date.now()}`)
                setDraft(null)
              }}
            />
          ))}
        </ViewportLayerPortal>
      )}

      {data.ports && (
        <ViewportLayerPortal>
          <div
            className="dg-port"
            data-kind="out"
            data-dg-edge={id}
            data-axis={['top', 'bottom'].includes(positionSide(ends.sourcePosition)) ? 'y' : 'x'}
            style={{ transform: `translate(${start.x}px, ${start.y}px)` }}
          />
          {data.markerEnd !== 'arrow' && (
            <div
              className="dg-port"
              data-kind="in"
              data-dg-edge={id}
              style={{ transform: `translate(${end.x}px, ${end.y}px)` }}
            />
          )}
        </ViewportLayerPortal>
      )}
    </>
  )
}
