import { desktopApi, isCaptureWindow } from '@/desktop/bridge'
import type { CaptureMoment, DesktopApi } from '@/desktop/contract'
import { compileFlow } from '@/engine/flow/compile'
import type { Flow } from '@/model/schema'
import { canvasBackground, captureBlob, captureCanvas, prepareAssets, waitForCommit, waitForPaint } from './capture'
import { planCapture } from './capture-plan'
import type { ExportStageProps, StageHandle } from './ExportStage'
import { mountExportStage } from './mount-stage'

/** An export stage as data. The capture window or this page mounts it. */
export interface StageSpec extends Omit<ExportStageProps, 'onReady'> {
  /** The flows whose token icons the stage loads. */
  flows: Flow[]
  /** After the mount, the view fits the diagram with this share of the size as padding. */
  fitPadding?: number
  /** The flow that the stage plays. The camera follows it. */
  flow?: { flow: Flow; pathId: string | null }
}

export interface CaptureOptions {
  /** Image pixels for each stage pixel. */
  scale: number
  transparent: boolean
}

/** An open export stage that gives images and video frames of its moments. */
export interface StageSession {
  /** The size of the stage in CSS pixels. */
  width: number
  height: number
  image(moment: CaptureMoment, options: CaptureOptions & { format: 'png' | 'svg' }): Promise<Blob>
  frame(moment: CaptureMoment, options: CaptureOptions): Promise<CanvasImageSource>
  dispose(): void
}

const STAGE_CLOSED = 'The export stage is closed.'

const EDGE_CHECK_INTERVAL_MS = 50
const EDGE_WAIT_LIMIT_MS = 5000

/**
 * Mounts the stage of a spec and prepares it: icons and fonts, the fit of the view and the flow.
 *
 * @param viewportScale - Scales the size and the viewport. Use a value other than 1 only for a spec without
 *   `fitPadding` and `flow`.
 */
export async function mountSpecStage(
  spec: StageSpec,
  viewportScale = 1,
): Promise<{ stage: StageHandle; dispose: () => void }> {
  const { flows, fitPadding, flow, ...props } = spec
  const { stage, dispose } = await mountExportStage({
    ...props,
    width: props.width * viewportScale,
    height: props.height * viewportScale,
    viewport: {
      x: props.viewport.x * viewportScale,
      y: props.viewport.y * viewportScale,
      zoom: props.viewport.zoom * viewportScale,
    },
  })
  try {
    await prepareAssets(props.nodes, flows)
    if (fitPadding !== undefined) await stage.fitView(fitPadding)
    if (flow) {
      const timeline = compileFlow(flow.flow, new Set(props.nodes.map((node) => node.id)), props.edges, flow.pathId)
      stage.engine.playback.load(flow.flow.id, timeline)
      stage.engine.playback.setFollow(true)
    }
    await waitForCommit()
    return { stage, dispose }
  } catch (error) {
    dispose()
    throw error
  }
}

/**
 * Waits until React Flow shows the edges of the stage. The wait ends when all edges with both ends on the stage show.
 * It also ends when a count above 0 stays the same for three checks. After `EDGE_WAIT_LIMIT_MS`, it ends without an
 * error.
 */
export async function edgesDrawn(stage: StageHandle, spec: StageSpec) {
  const ids = new Set(spec.nodes.map((node) => node.id))
  const expected = spec.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)).length
  const started = performance.now()
  let last = -1
  let same = 0
  while (performance.now() - started < EDGE_WAIT_LIMIT_MS) {
    const count = stage.root.querySelectorAll('.react-flow__edge').length
    if (count >= expected) return
    same = count > 0 && count === last ? same + 1 : 0
    if (same >= 3) return
    last = count
    await new Promise((resolve) => setTimeout(resolve, EDGE_CHECK_INTERVAL_MS))
  }
}

async function openLocalSession(spec: StageSpec): Promise<StageSession> {
  const { stage, dispose } = await mountSpecStage(spec)
  const background = (transparent: boolean) => (transparent ? null : canvasBackground(stage.root))
  return {
    width: spec.width,
    height: spec.height,
    async image(moment, { format, scale, transparent }) {
      stage.engine.render(moment.ambientMs, moment.timeMs)
      await waitForCommit()
      await waitForCommit()
      if (!document.hidden) await waitForPaint()
      return captureBlob(stage.root, format, { scale, backgroundColor: background(transparent) })
    },
    async frame(moment, { scale, transparent }) {
      stage.engine.render(moment.ambientMs, moment.timeMs)
      await waitForCommit()
      return captureCanvas(stage.root, { scale, backgroundColor: background(transparent), fast: true })
    },
    dispose,
  }
}

async function openNativeSession(desktop: DesktopApi, spec: StageSpec): Promise<StageSession> {
  const fixedViewport = spec.fitPadding === undefined && spec.flow === undefined
  const { sessionId } = await desktop.request('capture.open', {
    stage: spec,
    width: spec.width,
    height: spec.height,
    fixedViewport,
  })
  let local: Promise<StageSession> | null = null
  let disposed = false
  const fallback = async () => {
    if (disposed) throw new Error(STAGE_CLOSED)
    return (local ??= openLocalSession(spec))
  }
  const fits = (scale: number) => planCapture(spec, scale, fixedViewport) !== null
  return {
    width: spec.width,
    height: spec.height,
    async image(moment, options) {
      if (options.format === 'svg' || !fits(options.scale)) return (await fallback()).image(moment, options)
      try {
        const { png } = await desktop.request('capture.image', {
          sessionId,
          moment,
          scale: options.scale,
          transparent: options.transparent,
        })
        return new Blob([new Uint8Array(png)], { type: 'image/png' })
      } catch (error) {
        if (disposed) throw error
        return (await fallback()).image(moment, options)
      }
    },
    async frame(moment, options) {
      if (!fits(options.scale)) return (await fallback()).frame(moment, options)
      const { pixels, width, height } = await desktop.request('capture.frame', {
        sessionId,
        moment,
        scale: options.scale,
        transparent: options.transparent,
      })
      return createImageBitmap(new ImageData(new Uint8ClampedArray(pixels), width, height))
    },
    dispose() {
      disposed = true
      void desktop.request('capture.close', { sessionId }).catch(() => undefined)
      void local?.then((session) => session.dispose())
    },
  }
}

/**
 * Opens an export stage. In the desktop app, the stage renders in the capture window and Chromium captures its pixels.
 * On the website, in the capture window and for SVG, the stage mounts on this page and snapdom captures it. The desktop
 * app also uses snapdom above the limits of the capture window and after a failed image capture.
 *
 * @param options.native - False keeps the stage on this page.
 */
export function openStageSession(spec: StageSpec, { native = true }: { native?: boolean } = {}): Promise<StageSession> {
  const desktop = desktopApi()
  if (native && desktop && !isCaptureWindow()) return openNativeSession(desktop, spec)
  return openLocalSession(spec)
}
