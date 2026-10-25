import type { IconSet } from '@/canvas/icons/library'
import type { Diagram } from '@/model/schema'
import type { Template } from '@/templates'
import type { DiagramContent } from './compact'
import type { LayoutFunction } from './placement'

export interface RenderOptions {
  /** Node ids to frame. Without them the image shows the whole diagram. */
  focusIds?: string[]
  flowId?: string
  /** With `flowId`: the step to show, from 0. */
  step?: number
  theme?: 'dark' | 'light'
  maxSizePx: number
}

export interface RenderedImage {
  /** The PNG image as base64. */
  data: string
  width: number
  height: number
  /** Image pixels for each canvas pixel. */
  scale: number
}

/** What tool handlers need from the app. */
export interface HandlerContext {
  signal: AbortSignal
  /** The title of the tool that runs, which names the version that its change makes. */
  toolTitle: string
  /** Returns the id of the diagram that the editor shows, or `null` on other pages. */
  openDiagramId(): string | null
  /** Shows the diagram in the editor and resolves after the editor loads it. */
  openInEditor(id: string): Promise<void>
  goHome(): Promise<void>
  layout: LayoutFunction
  iconSets(): Promise<IconSet[]>
  lucideNames(): Promise<readonly string[]>
  mermaidToDiagram(source: string, name?: string): Promise<Diagram>
  renderPng(content: DiagramContent, options: RenderOptions): Promise<RenderedImage>
  templates: readonly Template[]
}
