import { useStore } from '@xyflow/react'
import { useMemo, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

function useFlowLayer(selector: string): HTMLElement | null {
  const domNode = useStore((state) => state.domNode)
  return useMemo(() => domNode?.querySelector<HTMLElement>(selector) ?? null, [domNode, selector])
}

export function EdgeLabelPortal({ children }: { children: ReactNode }) {
  const layer = useFlowLayer('.react-flow__edgelabel-renderer')
  return layer && createPortal(children, layer)
}

export function ViewportLayerPortal({ children }: { children: ReactNode }) {
  const layer = useFlowLayer('.react-flow__viewport-portal')
  return layer && createPortal(children, layer)
}
