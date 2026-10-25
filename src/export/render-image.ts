import { currentCanvasTheme } from '@/canvas/canvas-theme'
import type { DiagramContent } from '@/agent/compact'
import type { RenderedImage, RenderOptions } from '@/agent/context'
import { compileFlow } from '@/engine/flow/compile'
import { diagramBounds } from './bounds'
import { canvasBackground, captureBlob, prepareAssets, waitForCommit } from './capture'
import { mountExportStage } from './mount-stage'

const PADDING_PX = 48
const MAX_SCALE = 2
const FLOW_FRAME = { width: 1280, height: 720 }
const FLOW_FIT_PADDING = 0.12
/** The point in a step at which the image shows it, as a share of the step time. */
const STEP_MOMENT = 0.6

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const url = reader.result
      if (typeof url === 'string') resolve(url.slice(url.indexOf(',') + 1))
      else reject(new Error('The image could not be read.'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('The image could not be read.'))
    reader.readAsDataURL(blob)
  })
}

/** Renders a diagram, a part of it, or one step of a flow as a PNG image. */
export async function renderDiagramPng(content: DiagramContent, options: RenderOptions): Promise<RenderedImage> {
  const nodes = content.nodes.map((node) => ({ ...node, selected: false, dragging: false }))
  const edges = content.edges.map((edge) => ({ ...edge, selected: false }))
  const resolvedTheme = options.theme ?? currentCanvasTheme(content.theme.mode)
  const flow = options.flowId ? content.flows.find((candidate) => candidate.id === options.flowId) : undefined
  const bounds = diagramBounds(nodes, options.focusIds ? new Set(options.focusIds) : undefined)
  const size = flow
    ? FLOW_FRAME
    : { width: Math.ceil(bounds.width + PADDING_PX * 2), height: Math.ceil(bounds.height + PADDING_PX * 2) }
  const scale = Math.min(MAX_SCALE, options.maxSizePx / Math.max(size.width, size.height))

  const { stage, dispose } = await mountExportStage({
    ...size,
    nodes,
    edges,
    theme: { ...content.theme, background: 'none' },
    resolvedTheme,
    viewport: { x: PADDING_PX - bounds.x, y: PADDING_PX - bounds.y, zoom: 1 },
    transparent: false,
  })
  try {
    await prepareAssets(nodes, content.flows)
    let timeMs = 0
    if (flow) {
      const timeline = compileFlow(flow, new Set(nodes.map((node) => node.id)), edges)
      await stage.fitView(FLOW_FIT_PADDING)
      stage.engine.playback.load(flow.id, timeline)
      stage.engine.playback.setFollow(true)
      const stepId = options.step !== undefined ? flow.steps[options.step]?.id : undefined
      const segment = timeline.segments.find((candidate) => candidate.step.id === stepId)
      timeMs = segment ? segment.startMs + (segment.endMs - segment.startMs) * STEP_MOMENT : 0
      await waitForCommit()
    }
    stage.engine.render(timeMs, timeMs)
    await waitForCommit()
    await waitForCommit()
    const blob = await captureBlob(stage.root, 'png', { scale, backgroundColor: canvasBackground(stage.root) })
    return {
      data: await blobToBase64(blob),
      width: Math.round(size.width * scale),
      height: Math.round(size.height * scale),
      scale,
    }
  } finally {
    dispose()
  }
}
