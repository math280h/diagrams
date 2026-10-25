import type { SnapdomOptions } from '@zumer/snapdom'
import { preloadIcons } from '@/canvas/icon-cache'
import type { Flow } from '@/model/schema'
import type { DiagramNode } from '@/model/types'

const SNAPDOM_DEFAULTS = {
  embedFonts: true,
  reconcile: true,
  exclude: ['.react-flow__handle', '.react-flow__resize-control'],
  excludeMode: 'remove',
} satisfies SnapdomOptions

export function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

/** Waits for two animation frames. After this, React commits and layout are complete. */
export async function waitForPaint() {
  await nextFrame()
  await nextFrame()
}

/**
 * Waits for the next task. Microtasks in the queue, and the React commits in them, run first.
 *
 * Unlike {@link waitForPaint}, this also continues in a hidden tab.
 */
export function waitForCommit(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel()
    channel.port1.onmessage = () => {
      channel.port1.close()
      resolve()
    }
    channel.port2.postMessage(null)
  })
}

export function usedIcons(nodes: DiagramNode[], flows: Flow[]): Set<string> {
  const names = new Set<string>(['user'])
  for (const node of nodes) if ('icon' in node.data && node.data.icon) names.add(node.data.icon)
  for (const flow of flows) if (flow.token.icon) names.add(flow.token.icon)
  return names
}

export async function prepareAssets(nodes: DiagramNode[], flows: Flow[]) {
  await Promise.all([preloadIcons(usedIcons(nodes, flows)), document.fonts.ready])
}

export async function captureCanvas(element: HTMLElement, options: SnapdomOptions): Promise<HTMLCanvasElement> {
  const { snapdom } = await import('@zumer/snapdom')
  return snapdom.toCanvas(element, { ...SNAPDOM_DEFAULTS, ...options })
}

export async function captureBlob(element: HTMLElement, type: 'png' | 'svg', options: SnapdomOptions): Promise<Blob> {
  const { snapdom } = await import('@zumer/snapdom')
  return snapdom.toBlob(element, { ...SNAPDOM_DEFAULTS, ...options, type })
}

export function canvasBackground(element: HTMLElement): string {
  return getComputedStyle(element).getPropertyValue('--dg-ground').trim() || '#000000'
}
