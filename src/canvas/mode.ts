import { createContext, use } from 'react'
import type { DiagramTheme } from '@/model/schema'
import type { DataCrossing } from '@/model/threats'

export interface CanvasMode {
  editable: boolean
  background: DiagramTheme['background']
  /** Opens the diagram that a node leads to. Without it, nodes show no open button. */
  openDiagram?: (diagramId: string, nodeId: string) => void
  /** The edges that carry sensitive fields, by edge id. With it, the canvas shows the sensitive data view. */
  threats?: ReadonlyMap<string, DataCrossing>
}

export const CanvasModeContext = createContext<CanvasMode>({ editable: false, background: 'none' })

export function useCanvasMode(): CanvasMode {
  return use(CanvasModeContext)
}
