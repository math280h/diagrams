import { currentCanvasTheme } from '@/canvas/canvas-theme'
import type { DiagramContent } from '@/agent/compact'
import type { RenderedImage, RenderOptions } from '@/agent/context'
import { compileFlow } from '@/engine/flow/compile'
import { diagramBounds } from './bounds'
import { canvasBackground, captureBlob, prepareAssets, waitForCommit } from './capture'
import { mountExportStage } from './mount-stage'
import { recordStage, type VideoFormat } from './video'
import { pathSteps } from '@/model/flow'
import { describeDiagram, svgWithDescription } from './describe'

const PADDING_PX = 48
const MAX_SCALE = 2
const FLOW_FRAME = { width: 1280, height: 720 }
const GIF_FRAME = { width: 960, height: 540 }
const VIDEO_FPS = 30
const GIF_FPS = 15
const NO_FLOW_RECORDING_MS = 6000
const LAST_FRAME_HOLD_MS = 800
const FLOW_FIT_PADDING = 0.12
/** The point in a step at which the image shows it, as a share of the step time. */
const STEP_MOMENT = 0.6

export function blobToBase64(blob: Blob): Promise<string> {
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

/**
 * Renders a diagram, a part of it, or one step of a flow as a PNG or SVG image.
 *
 * @returns The image, its size in pixels, and the image pixels for each canvas pixel.
 */
export async function renderDiagramImage(
  content: DiagramContent,
  options: RenderOptions & { format: 'png' | 'svg' },
): Promise<{ blob: Blob; width: number; height: number; scale: number }> {
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
      const pathId = options.pathId ?? null
      const timeline = compileFlow(flow, new Set(nodes.map((node) => node.id)), edges, pathId)
      await stage.fitView(FLOW_FIT_PADDING)
      stage.engine.playback.load(flow.id, timeline)
      stage.engine.playback.setFollow(true)
      const stepId = options.step !== undefined ? pathSteps(flow, pathId)[options.step]?.id : undefined
      const segment = timeline.segments.find((candidate) => candidate.step.id === stepId)
      timeMs = segment ? segment.startMs + (segment.endMs - segment.startMs) * STEP_MOMENT : 0
      await waitForCommit()
    }
    stage.engine.render(timeMs, timeMs)
    await waitForCommit()
    await waitForCommit()
    const image = await captureBlob(stage.root, options.format, {
      scale,
      backgroundColor: canvasBackground(stage.root),
    })
    const blob =
      options.format === 'svg' && !options.focusIds ? await svgWithDescription(image, describeDiagram(content)) : image
    return { blob, width: Math.round(size.width * scale), height: Math.round(size.height * scale), scale }
  } finally {
    dispose()
  }
}

/** Renders a diagram, a part of it, or one step of a flow as a PNG image. */
export async function renderDiagramPng(content: DiagramContent, options: RenderOptions): Promise<RenderedImage> {
  const { blob, width, height, scale } = await renderDiagramImage(content, { ...options, format: 'png' })
  return { data: await blobToBase64(blob), width, height, scale }
}

/**
 * Records a flow as a video or a GIF. Without a flow, it records six seconds of the traffic animation.
 *
 * @throws Error If this browser has no encoder for the format.
 */
export async function renderDiagramVideo(
  content: DiagramContent,
  options: { format: VideoFormat; theme?: 'dark' | 'light'; flowId?: string; pathId?: string; maxSizePx?: number },
): Promise<Blob> {
  const nodes = content.nodes.map((node) => ({ ...node, selected: false, dragging: false }))
  const edges = content.edges.map((edge) => ({ ...edge, selected: false }))
  const flow = options.flowId ? content.flows.find((candidate) => candidate.id === options.flowId) : undefined
  const frame = options.format === 'gif' ? GIF_FRAME : FLOW_FRAME
  const { stage, dispose } = await mountExportStage({
    ...frame,
    nodes,
    edges,
    theme: { ...content.theme, background: 'none' },
    resolvedTheme: options.theme ?? currentCanvasTheme(content.theme.mode),
    viewport: { x: 0, y: 0, zoom: 1 },
    transparent: false,
  })
  try {
    await prepareAssets(nodes, content.flows)
    await stage.fitView(FLOW_FIT_PADDING)
    let durationMs = NO_FLOW_RECORDING_MS
    if (flow) {
      const timeline = compileFlow(flow, new Set(nodes.map((node) => node.id)), edges, options.pathId ?? null)
      stage.engine.playback.load(flow.id, timeline)
      stage.engine.playback.setFollow(true)
      durationMs = timeline.durationMs + LAST_FRAME_HOLD_MS
    }
    return await recordStage(stage, {
      format: options.format,
      fps: options.format === 'gif' ? GIF_FPS : VIDEO_FPS,
      durationMs,
      ambientStartMs: 0,
      scale:
        options.maxSizePx === undefined
          ? 1
          : Math.min(MAX_SCALE, options.maxSizePx / Math.max(frame.width, frame.height)),
      signal: new AbortController().signal,
      onProgress: () => undefined,
    })
  } finally {
    dispose()
  }
}
