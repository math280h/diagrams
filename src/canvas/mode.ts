import { createContext, use } from 'react'
import type { DiagramTheme } from '@/model/schema'

export interface CanvasMode {
  editable: boolean
  background: DiagramTheme['background']
}

export const CanvasModeContext = createContext<CanvasMode>({ editable: false, background: 'none' })

export function useCanvasMode(): CanvasMode {
  return use(CanvasModeContext)
}
