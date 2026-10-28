import { create } from 'zustand'

export type FlowView = 'steps' | 'sequence' | 'timeline'

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
export type ExportKind = 'image' | 'video' | 'page' | 'link' | 'mermaid' | 'text' | 'readme' | 'json'

interface UiState {
  activeFlowId: string | null
  /** The path of the active flow that plays, or `null` for its main steps. */
  activePathId: string | null
  flowPanelOpen: boolean
  flowView: FlowView
  selectedStepId: string | null
  recording: boolean
  commandOpen: boolean
  exportOpen: ExportKind | null
  importOpen: boolean
  traceImportOpen: boolean
  shortcutsOpen: boolean
  historyOpen: boolean
  /** Shows the connections that carry personal data or secrets, and dims the other connections. */
  sensitiveView: boolean
  insert: InsertRequest | null
}

export const useUi = create<UiState>(() => ({
  activeFlowId: null,
  activePathId: null,
  flowPanelOpen: false,
  flowView: 'steps',
  selectedStepId: null,
  recording: false,
  commandOpen: false,
  exportOpen: null,
  importOpen: false,
  traceImportOpen: false,
  shortcutsOpen: false,
  historyOpen: false,
  sensitiveView: false,
  insert: null,
}))

export function setUi(patch: Partial<UiState>) {
  useUi.setState(patch)
}
