import { useStore, type NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'
import type { TextNodeType } from '@/model/types'
import { updateNodeData } from '@/store/actions'
import { useCanvasMode } from '@/canvas/mode'
import { EditableText } from './EditableText'
import { WidthResizer } from './resize'
import { SideHandles } from './SideHandles'

export function TextNode({ id, data, selected }: NodeProps<TextNodeType>) {
  const { editable } = useCanvasMode()
  const fixedWidth = useStore((state) => state.nodeLookup.get(id)?.width !== undefined)
  return (
    <>
      {editable && selected && <WidthResizer minWidth={24} />}
      <SideHandles connectable={editable} />
      <div
        className={cn('dg-text', data.mono && 'dg-mono')}
        data-size={data.size}
        data-tone={data.tone}
        style={{ textAlign: data.align, whiteSpace: fixedWidth ? 'pre-wrap' : 'pre' }}
      >
        <EditableText
          value={data.text}
          editable={editable}
          multiline
          placeholder="Text"
          onCommit={(text) => updateNodeData(id, { text })}
          style={{ display: 'block', width: '100%', resize: 'none' }}
        />
      </div>
    </>
  )
}
