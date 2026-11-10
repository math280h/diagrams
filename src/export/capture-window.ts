import { serveMainRequests } from '@/desktop/serve'
import { canvasBackground, waitForCommit, waitForPaint } from './capture'
import { MARKER_PX, markerColors } from './capture-plan'
import type { StageHandle } from './ExportStage'
import { edgesDrawn, mountSpecStage, type StageSpec } from './stage-session'

const NOT_HERE = 'The capture window only renders export stages.'
const ZOOM_WAIT_LIMIT_MS = 5000
/**
 * The largest difference between the device pixel ratio and the page zoom, as a share of the page zoom, that counts as
 * the same zoom.
 */
const ZOOM_TOLERANCE = 0.001

async function zoomApplied(pageZoom: number) {
  const started = performance.now()
  // In Chromium, window.devicePixelRatio is the device scale factor times the page zoom.
  while (Math.abs(window.devicePixelRatio - pageZoom) > ZOOM_TOLERANCE * pageZoom) {
    if (performance.now() - started > ZOOM_WAIT_LIMIT_MS) {
      throw new Error(`The capture window shows the zoom ${window.devicePixelRatio}, not ${pageZoom}.`)
    }
    await new Promise((resolve) => requestAnimationFrame(resolve))
  }
}

/**
 * Answers the capture requests of the main process: mounts one export stage at a time and shows it at a moment.
 *
 * @returns A function that stops the answers.
 */
export function startCaptureWindow(): () => void {
  document.documentElement.style.background = 'transparent'
  document.body.style.background = 'transparent'
  const marker = document.createElement('div')
  marker.setAttribute('aria-hidden', 'true')
  Object.assign(marker.style, {
    position: 'fixed',
    left: '0',
    bottom: '0',
    display: 'flex',
    zIndex: '1',
    pointerEvents: 'none',
  })
  const squares = [document.createElement('div'), document.createElement('div')]
  marker.append(...squares)
  document.body.append(marker)
  let mounted: { stage: StageHandle; dispose: () => void } | null = null
  const refuse = () => Promise.reject(new Error(NOT_HERE))
  return serveMainRequests({
    'agent.call': refuse,
    'handoff.open': refuse,
    'render.file': refuse,
    'app.flush': async () => null,
    'capture.mount': async ({ stage, viewportScale }) => {
      mounted?.dispose()
      mounted = null
      const spec = stage as StageSpec
      const next = await mountSpecStage(spec, viewportScale)
      // Chromium draws the text of a layer with `will-change: transform` without subpixel anti-aliasing.
      next.stage.root.closest<HTMLElement>('.dg-export-stage')?.style.setProperty('will-change', 'transform')
      await edgesDrawn(next.stage, spec)
      mounted = next
      return null
    },
    'capture.render': async (request) => {
      if (!mounted) throw new Error('No export stage is mounted.')
      const { stage } = mounted
      await zoomApplied(request.pageZoom)
      stage.engine.render(request.moment.ambientMs, request.moment.timeMs)
      const background = request.transparent ? 'transparent' : canvasBackground(stage.root)
      document.documentElement.style.background = background
      const frame = stage.root.closest<HTMLElement>('.dg-export-stage')
      if (frame) frame.style.background = background
      await waitForCommit()
      await waitForCommit()
      const side = `${MARKER_PX / request.pageZoom}px`
      const colours = markerColors(request.marker)
      squares.forEach((square, index) =>
        Object.assign(square.style, { width: side, height: side, background: colours[index] }),
      )
      await waitForPaint()
      return null
    },
  })
}
