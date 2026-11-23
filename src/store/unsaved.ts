import { create } from 'zustand'
import type { SaveFailure } from '@/persistence/repository'

/** The open diagram when its last save did not reach storage. */
export interface UnsavedDiagram {
  id: string
  reason: SaveFailure['reason']
  message: string
}

export const useUnsaved = create<{ diagram: UnsavedDiagram | null }>(() => ({ diagram: null }))
