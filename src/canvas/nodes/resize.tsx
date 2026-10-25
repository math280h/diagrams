import { NodeResizeControl, NodeResizer, ResizeControlVariant } from '@xyflow/react'
import { beginGesture, endGesture } from '@/store/history'

export function WidthResizer({ minWidth }: { minWidth: number }) {
  return (
    <>
      {(['left', 'right'] as const).map((position) => (
        <NodeResizeControl
          key={position}
          position={position}
          variant={ResizeControlVariant.Line}
          resizeDirection="horizontal"
          minWidth={minWidth}
          onResizeStart={beginGesture}
          onResizeEnd={endGesture}
          style={{ borderWidth: 4, borderColor: 'transparent' }}
        />
      ))}
    </>
  )
}

export function BoxResizer({
  visible,
  minWidth,
  minHeight,
  keepAspectRatio,
}: {
  visible: boolean
  minWidth: number
  minHeight: number
  keepAspectRatio?: boolean
}) {
  return (
    <NodeResizer
      isVisible={visible}
      minWidth={minWidth}
      minHeight={minHeight}
      keepAspectRatio={keepAspectRatio}
      onResizeStart={beginGesture}
      onResizeEnd={endGesture}
    />
  )
}
