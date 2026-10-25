import { Handle, Position } from '@xyflow/react'
import { SIDES, type Side } from '@/model/schema'

const SIDE_POSITION: Record<Side, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
}

export function SideHandles({ connectable }: { connectable: boolean }) {
  return SIDES.map((side) => (
    <Handle key={side} id={side} type="source" position={SIDE_POSITION[side]} isConnectable={connectable} />
  ))
}
