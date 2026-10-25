import { useInternalNode, type EdgeProps } from '@xyflow/react'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useEngine } from '@/engine/hooks'
import { hashUnit } from '@/engine/hash'
import { buildArcTable, pointAt } from '@/engine/path-sampler'
import { COMET_TRAIL, dashPattern, particleCount } from '@/engine/traffic'
import { defaultEdgeData } from '@/model/defaults'
import { edgeProtocol } from '@/model/protocols'
import type { EdgeData } from '@/model/schema'
import type { DiagramEdge } from '@/model/types'
import { selectOnly, updateEdgeData } from '@/store/actions'
import { useCanvasMode } from '@/canvas/mode'
import { EditableText } from '@/canvas/nodes/EditableText'
import { EdgeLabelPortal, ViewportLayerPortal } from '@/canvas/portal'
import {
  autoEndpoints,
  edgePath,
  internalRect,
  positionSide,
  routeFits,
  routePath,
  type EdgeEndpoints,
} from './geometry'

const FALLBACK_DATA = defaultEdgeData()
/** The path styles that can follow a layout route. Curves and straight lines keep their own shape. */
const ROUTED_PATHS: ReadonlySet<EdgeData['path']> = new Set(['smooth', 'step'])
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

export function FlowEdge(props: EdgeProps<DiagramEdge>) {
  const { id, source, target, data = FALLBACK_DATA, selected } = props
  const engine = useEngine()
  const { editable } = useCanvasMode()
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)
  const trafficRef = useRef<SVGGElement>(null)

  const auto = data.sides === 'auto' && sourceNode && targetNode
  const ends: EdgeEndpoints = auto ? autoEndpoints(internalRect(sourceNode), internalRect(targetNode)) : props
  const routed =
    auto &&
    data.route &&
    ROUTED_PATHS.has(data.path) &&
    routeFits(data.route, internalRect(sourceNode), internalRect(targetNode))
  const path = routed && data.route ? routePath(data.route, ROUTE_RADIUS[data.path] ?? 0) : edgePath(data.path, ends)[0]
  const table = useMemo(() => buildArcTable(path), [path])

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

  const start = pointAt(table, 0)
  const end = pointAt(table, 1)
  const label = pointAt(table, labelFraction(data.label, data.labelPosition, table.lengthPx))
  const strokeWidth = data.width
  const protocol = edgeProtocol(data) ?? undefined

  return (
    <>
      <g className="dg-edge" data-protocol={protocol}>
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

      {data.label && (
        <EdgeLabelPortal>
          <div
            className="dg-edge-label dg-mono nodrag nopan"
            data-dg-edge={id}
            data-protocol={protocol}
            data-selected={selected ? 'true' : undefined}
            style={{ transform: `translate(-50%, -50%) translate(${label.x}px, ${label.y}px)` }}
            onClick={() => editable && selectOnly([], [id])}
          >
            <EditableText
              value={data.label}
              editable={editable}
              onCommit={(value) => updateEdgeData(id, { label: value })}
              style={{ width: `${Math.max(2, data.label.length + 1)}ch` }}
            />
          </div>
        </EdgeLabelPortal>
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
