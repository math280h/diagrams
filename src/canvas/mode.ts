import { createContext, use } from 'react'
import type { DiagramTheme } from '@/model/schema'

export interface CanvasMode {
  editable: boolean
  background: DiagramTheme['background']
  /** Opens the diagram that a node leads to. Without it, nodes show no open button. */
  openDiagram?: (diagramId: string, nodeId: string) => void
}

export const CanvasModeContext = createContext<CanvasMode>({ editable: false, background: 'none' })

export function useCanvasMode(): CanvasMode {
  return use(CanvasModeContext)
}
