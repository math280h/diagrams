import type { NodeProps } from '@xyflow/react'
import type { ShapeNodeType } from '@/model/types'
import { updateNodeData } from '@/store/actions'
import { Icon } from '@/canvas/icon'
import { useCanvasMode } from '@/canvas/mode'
import { EditableText } from './EditableText'
import { BoxResizer } from './resize'
import { shapeOutline } from './shape-outline'
import { SideHandles } from './SideHandles'

export function ShapeNode({ id, data, selected, width, height }: NodeProps<ShapeNodeType>) {
  const { editable } = useCanvasMode()
  const w = width ?? 160
  const h = height ?? 72
  const { outline, detail } = shapeOutline(data.shape, w, h)
  const compact = data.shape === 'circle' || data.shape === 'diamond'

  return (
    <>
      <BoxResizer visible={editable && selected} minWidth={48} minHeight={32} />
      <SideHandles connectable={editable} />
      <div className="dg-shape" data-fill={data.fill} style={{ width: w, height: h }}>
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
          <path className="dg-shape-outline" d={outline} />
          {detail && <path className="dg-shape-detail" d={detail} />}
        </svg>
        <div className="dg-shape-label" style={compact ? { padding: '8px 18%' } : undefined}>
          {data.icon && <Icon name={data.icon} strokeWidth={1.75} />}
          <EditableText
            value={data.label}
            editable={editable}
            placeholder="Label"
            onCommit={(label) => updateNodeData(id, { label })}
          />
        </div>
      </div>
    </>
  )
}
