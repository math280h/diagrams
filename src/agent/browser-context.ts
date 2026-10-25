import { router } from '@/router'
import { openDiagramId as savedDiagramId, whenDiagramReady } from '@/store/document'
import { TEMPLATES } from '@/templates'
import type { HandlerContext } from './context'
import { ToolError } from './errors'

const EDITOR_PATH = /^\/d\/([^/]+)$/

function openDiagramId(): string | null {
  const match = EDITOR_PATH.exec(router.state.location.pathname)
  const id = match?.[1] ? decodeURIComponent(match[1]) : null
  return id !== null && savedDiagramId() === id ? id : null
}

/** Creates the handler context of the app in this window, which uses the router and the editor. */
export function createBrowserContext(signal: AbortSignal): Omit<HandlerContext, 'toolTitle'> {
  return {
    signal,
    openDiagramId,
    async openInEditor(id) {
      if (openDiagramId() !== id) await router.navigate({ to: '/d/$diagramId', params: { diagramId: id } })
      const status = await whenDiagramReady(id)
      if (status.kind === 'missing') throw new ToolError(`No diagram has the id "${id}".`)
      if (status.kind === 'invalid') throw new ToolError(`The diagram "${id}" cannot be read: ${status.message}`)
    },
    async goHome() {
      await router.navigate({ to: '/' })
    },
    async layout(nodes, edges, direction) {
      return (await import('@/layout/diagram-layout')).layoutDiagram(nodes, edges, direction)
    },
    async iconSets() {
      return (await import('@/canvas/icons/library')).loadIconSets()
    },
    async lucideNames() {
      return (await import('@/canvas/icon-cache')).loadIconNames()
    },
    async mermaidToDiagram(source, name) {
      return (await import('@/import/mermaid')).mermaidToDiagram(source, name)
    },
    async renderPng(content, options) {
      return (await import('@/export/render-image')).renderDiagramPng(content, options)
    },
    templates: TEMPLATES,
  }
}
