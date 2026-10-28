import type { NodeProps } from '@xyflow/react'
import { useId } from 'react'
import { boundaryKind, boundaryKindLabel, SOLID_TIERS } from '@/model/boundaries'
import { GRID_PX } from '@/model/graph'
import type { DiagramTheme } from '@/model/schema'
import type { GroupNodeType } from '@/model/types'
import { updateNodeData } from '@/store/actions'
import { GRID_DOT_PX } from '@/canvas/grid'
import { Icon } from '@/canvas/icon'
import { useCanvasMode } from '@/canvas/mode'
import { useZoomScopeRef } from '@/canvas/zoom-scope'
import { EditableText } from './EditableText'
import { BoxResizer } from './resize'
import { OpenButton } from './OpenButton'

export function GroupNode({ id, data, selected, positionAbsoluteX, positionAbsoluteY }: NodeProps<GroupNodeType>) {
  const { editable, background } = useCanvasMode()
  const zoomScope = useZoomScopeRef()
  const kind = boundaryKind(data.kind)
  const kindLabel = boundaryKindLabel(kind)
  const custom = kind.tier === 'custom'
  const solid = SOLID_TIERS.has(kind.tier)
  return (
    <>
      <BoxResizer visible={editable && selected} minWidth={120} minHeight={80} />
      <div
        className="dg-group"
        data-tier={kind.tier}
        data-color={data.color === 'auto' ? kind.color : data.color}
        data-border={data.border}
        data-tint={String(data.tint)}
        data-solid={solid ? 'true' : undefined}
      >
        <svg className="dg-group-outline" aria-hidden>
          {solid && <SolidFill x={positionAbsoluteX} y={positionAbsoluteY} background={background} />}
          <rect x="0.5" y="0.5" width="100%" height="100%" />
        </svg>
        <div className="dg-group-label">
          {data.icon && (
            <span ref={zoomScope} className="dg-zoom-scope">
              <Icon name={data.icon} className="dg-group-icon" strokeWidth={1.75} />
            </span>
          )}
          <span className="dg-group-text">
            {kindLabel && <span className="dg-group-kind">{kindLabel}</span>}
            {(custom || data.label) && (
              <EditableText
                className="dg-group-name"
                value={data.label}
                editable={editable}
                placeholder="Group"
                onCommit={(label) => updateNodeData(id, { label })}
              />
            )}
            {data.detail && <span className="dg-group-detail dg-mono">{data.detail}</span>}
            <OpenButton diagramId={data.opens} nodeId={id} />
          </span>
        </div>
      </div>
    </>
  )
}

// React Flow starts each background tile half a gap before the grid point.
function tileOffset(position: number): number {
  const offset = (-GRID_PX / 2 - position) % GRID_PX
  return offset < 0 ? offset + GRID_PX : offset
}

function SolidFill({ x, y, background }: { x: number; y: number; background: DiagramTheme['background'] }) {
  const patternId = `dg-grid-${useId().replace(/[^\w-]/g, '')}`
  const radius = GRID_DOT_PX / 2
  return (
    <>
      <rect className="dg-group-ground" x="0.5" y="0.5" width="100%" height="100%" />
      {background !== 'none' && (
        <>
          <defs>
            <pattern
              id={patternId}
              x={tileOffset(x)}
              y={tileOffset(y)}
              width={GRID_PX}
              height={GRID_PX}
              patternUnits="userSpaceOnUse"
            >
              {background === 'dots' ? (
                <circle className="dg-group-dot" cx={radius} cy={radius} r={radius} />
              ) : (
                <path className="dg-group-gridline" d={`M${GRID_PX / 2} 0V${GRID_PX}M0 ${GRID_PX / 2}H${GRID_PX}`} />
              )}
            </pattern>
          </defs>
          <rect
            className="dg-group-grid"
            x="0.5"
            y="0.5"
            width="100%"
            height="100%"
            style={{ fill: `url(#${patternId})` }}
          />
        </>
      )}
    </>
  )
}
