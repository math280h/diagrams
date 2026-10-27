import { create } from 'zustand'

export type FlowView = 'steps' | 'timeline'

/**
 * A request to show the insert menu.
 *
 * The menu opens at `screen`, in viewport pixels. The new node goes to `flow`, in canvas
 * coordinates.
 */
export interface InsertRequest {
  screen: { x: number; y: number }
  flow: { x: number; y: number }
  /** The node that the new node connects from, if a connection ended on empty canvas. */
  sourceId?: string
}
export type ExportKind = 'image' | 'video' | 'page' | 'mermaid' | 'json'

interface UiState {
  activeFlowId: string | null
  flowPanelOpen: boolean
  flowView: FlowView
  selectedStepId: string | null
  recording: boolean
  commandOpen: boolean
  exportOpen: ExportKind | null
  importOpen: boolean
  shortcutsOpen: boolean
  historyOpen: boolean
  insert: InsertRequest | null
}

export const useUi = create<UiState>(() => ({
  activeFlowId: null,
  flowPanelOpen: false,
  flowView: 'steps',
  selectedStepId: null,
  recording: false,
  commandOpen: false,
  exportOpen: null,
  importOpen: false,
  shortcutsOpen: false,
  historyOpen: false,
  insert: null,
}))

export function setUi(patch: Partial<UiState>) {
  useUi.setState(patch)
}
