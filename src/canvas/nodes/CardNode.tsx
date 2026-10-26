import type { NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'
import type { CardNodeType } from '@/model/types'
import { updateNodeData } from '@/store/actions'
import { Icon } from '@/canvas/icon'
import { useCanvasMode } from '@/canvas/mode'
import { useZoomScopeRef } from '@/canvas/zoom-scope'
import { EditableText } from './EditableText'
import { isIdentifier, renderHighlighted } from './highlight'
import { WidthResizer } from './resize'
import { SideHandles } from './SideHandles'

export function CardNode({ id, data, selected }: NodeProps<CardNodeType>) {
  const { editable } = useCanvasMode()
  const zoomScope = useZoomScopeRef()
  const meterText = data.meterText || (data.meter !== null ? `${Math.round(data.meter * 100)}%` : '')

  return (
    <>
      {editable && selected && <WidthResizer minWidth={132} />}
      <SideHandles connectable={editable} />
      <div className="dg-card" data-form={data.form} data-color={data.color === 'neutral' ? undefined : data.color}>
        <div className="dg-card-head">
          {data.icon && (
            <span ref={zoomScope} className="dg-zoom-scope">
              <Icon name={data.icon} className="dg-card-icon" strokeWidth={1.75} />
            </span>
          )}
          <EditableText
            className="dg-card-title"
            value={data.title}
            editable={editable}
            placeholder="Name"
            onCommit={(title) => updateNodeData(id, { title })}
          />
          {data.status !== 'none' && <span className="dg-status" data-status={data.status} />}
          {data.badge && <span className="dg-card-badge dg-mono">{data.badge}</span>}
        </div>
        {data.lines.length > 0 && (
          <div className="dg-card-lines">
            {data.lines.map((line) => (
              <div key={line.id} className={cn('dg-card-line', isIdentifier(line.text) && 'dg-mono')}>
                {renderHighlighted(line.text)}
              </div>
            ))}
          </div>
        )}
        {data.meter !== null && (
          <div className="dg-meter">
            <div className="dg-meter-track">
              <div className="dg-meter-fill" style={{ width: `${data.meter * 100}%` }} />
            </div>
            <span className="dg-meter-text dg-mono">{meterText}</span>
          </div>
        )}
      </div>
    </>
  )
}
