import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { app, BrowserWindow, type NativeImage, type WebContents } from 'electron'
import { CAPTURE_HASH } from '@/desktop/constants'
import type { CaptureRequest } from '@/desktop/contract'
import { bgraToRgba, MARKER_COUNT, MARKER_PX, planCapture, readMarker, type CapturePlan } from '@/export/capture-plan'
import { APP_ORIGIN, originOf } from './app-protocol'
import type { MainHandlers } from './ipc'
import { devServerUrl, preloadPath } from './paths'
import { createRendererRpc } from './renderer-rpc'
import { rendererOrigin } from './window'

/** The capture window closes after this time without a capture. */
const IDLE_CLOSE_MS = 30_000
const CALL_TIMEOUT_MS = 120_000
/** An image capture takes frames until two frames are the same, but not more than this number of frames. */
const MAX_IMAGE_FRAMES = 10
const IMAGE_FRAME_GAP_MS = 30
/** The main process keeps at most this many open stages, and removes the oldest first. */
const MAX_SESSIONS = 16

/** A capture waits at most this long for the frame of its render request. */
const PAINT_TIMEOUT_MS = 5000

interface Session {
  stage: unknown
  width: number
  height: number
  fixedViewport: boolean
}

/** Tells whether a frame shows the render request with `marker`. The frame can be larger than the planned window. */
function showsRender(frame: NativeImage, plan: CapturePlan, marker: number) {
  const { width, height } = frame.getSize()
  if (width < plan.windowWidth || height < plan.windowHeight) return false
  const squares = frame.crop({ x: 0, y: height - MARKER_PX, width: MARKER_PX * 2, height: MARKER_PX }).toBitmap()
  return readMarker(squares) === marker
}

/** Repaints the whole window and resolves with the first frame that `accept` takes. */
function nextFrame(contents: WebContents, accept: (frame: NativeImage) => boolean): Promise<NativeImage> {
  return new Promise((resolve, reject) => {
    const stop = () => {
      clearTimeout(timer)
      if (contents.isDestroyed()) return
      contents.off('paint', onPaint)
      contents.off('destroyed', onDestroyed)
    }
    const fail = (message: string) => {
      stop()
      reject(new Error(message))
    }
    const timer = setTimeout(() => fail('The capture window did not paint the stage in time.'), PAINT_TIMEOUT_MS)
    const onDestroyed = () => fail('The capture window closed.')
    // In offscreen mode, the image of a paint event holds the whole frame.
    const onPaint = (_event: Electron.Event, _dirty: Electron.Rectangle, frame: NativeImage) => {
      if (!accept(frame)) return contents.invalidate()
      stop()
      resolve(frame)
    }
    contents.on('paint', onPaint)
    contents.once('destroyed', onDestroyed)
    contents.invalidate()
  })
}

export type CaptureHandlers = Pick<MainHandlers, 'capture.open' | 'capture.image' | 'capture.frame' | 'capture.close'>

/**
 * Renders export stages in a hidden offscreen window and captures them with Chromium.
 *
 * Captures run one at a time. The window shows one stage at a time. When a capture has a different session or viewport
 * scale than the last capture, the window mounts its stage.
 */
export function createCaptureService(): { handlers: CaptureHandlers; dispose: () => void } {
  const rpc = createRendererRpc()
  const sessions = new Map<string, Session>()
  let window: BrowserWindow | null = null
  let mounted: { sessionId: string; viewportScale: number; pageZoom: number } | null = null
  let renders = 0
  let queue: Promise<unknown> = Promise.resolve()
  let idleTimer: ReturnType<typeof setTimeout> | undefined

  const closeWindow = () => {
    clearTimeout(idleTimer)
    const current = window
    window = null
    mounted = null
    if (current && !current.isDestroyed()) current.destroy()
  }

  const onWindowCreated = (_event: Electron.Event, created: BrowserWindow) => {
    if (created === window) return
    created.once('closed', () => {
      const others = BrowserWindow.getAllWindows().filter((other) => other !== window && !other.isDestroyed())
      if (others.length === 0) closeWindow()
    })
  }
  app.on('browser-window-created', onWindowCreated)

  const openWindow = (): BrowserWindow => {
    if (window && !window.isDestroyed() && !window.webContents.isCrashed()) return window
    closeWindow()
    const created = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      transparent: true,
      backgroundColor: '#00000000',
      enableLargerThanScreen: true,
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        offscreen: { deviceScaleFactor: 1 },
        zoomMode: 'isolated',
        backgroundThrottling: false,
        spellcheck: false,
      },
    })
    created.webContents.setFrameRate(60)
    created.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    created.webContents.on('will-navigate', (event, url) => {
      if (originOf(url) !== rendererOrigin()) event.preventDefault()
    })
    created.once('closed', () => {
      if (window !== created) return
      window = null
      mounted = null
    })
    created.webContents.on('render-process-gone', () => {
      if (window === created) closeWindow()
    })
    window = created
    mounted = null
    rpc.attach(created.webContents)
    void created.loadURL(`${devServerUrl() ?? `${APP_ORIGIN}/index.html`}${CAPTURE_HASH}`)
    return created
  }

  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    clearTimeout(idleTimer)
    const run = queue.then(task, task)
    queue = run.catch(() => undefined)
    void queue.then(() => {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(closeWindow, IDLE_CLOSE_MS)
    })
    return run
  }

  const show = async (request: CaptureRequest) => {
    const session = sessions.get(request.sessionId)
    if (!session) throw new Error('The export stage is closed.')
    const plan = planCapture(session, request.scale, session.fixedViewport)
    if (!plan) throw new Error('The image is too large for the capture window.')
    const target = openWindow()
    const remount =
      mounted?.sessionId !== request.sessionId ||
      mounted.viewportScale !== plan.viewportScale ||
      mounted.pageZoom !== plan.pageZoom
    if (remount) {
      mounted = null
      await rpc.whenReady(CALL_TIMEOUT_MS)
    }
    target.webContents.setZoomFactor(plan.pageZoom)
    target.setContentSize(plan.windowWidth, plan.windowHeight)
    if (remount) {
      await rpc.call(
        'capture.mount',
        { stage: session.stage, viewportScale: plan.viewportScale, pageZoom: plan.pageZoom },
        { timeoutMs: CALL_TIMEOUT_MS },
      )
      mounted = { sessionId: request.sessionId, viewportScale: plan.viewportScale, pageZoom: plan.pageZoom }
    }
    renders += 1
    const marker = renders % MARKER_COUNT
    await rpc.call(
      'capture.render',
      { moment: request.moment, transparent: request.transparent, marker, pageZoom: plan.pageZoom },
      { timeoutMs: CALL_TIMEOUT_MS },
    )
    return { target, plan, marker }
  }

  const capture = async ({ target, plan, marker }: Awaited<ReturnType<typeof show>>): Promise<NativeImage> => {
    const frame = await nextFrame(target.webContents, (candidate) => showsRender(candidate, plan, marker))
    const stage = frame.crop({ x: 0, y: 0, width: plan.stageWidth, height: plan.stageHeight })
    if (plan.stageWidth === plan.outputWidth && plan.stageHeight === plan.outputHeight) return stage
    return stage.resize({ width: plan.outputWidth, height: plan.outputHeight, quality: 'best' })
  }

  const handlers: CaptureHandlers = {
    'capture.open': async ({ stage, width, height, fixedViewport }) => {
      const sessionId = randomUUID()
      sessions.set(sessionId, { stage, width, height, fixedViewport })
      for (const oldest of sessions.keys()) {
        if (sessions.size <= MAX_SESSIONS) break
        sessions.delete(oldest)
      }
      return { sessionId }
    },
    'capture.image': (request) =>
      serial(async () => {
        const shown = await show(request)
        let image = await capture(shown)
        let pixels = image.toBitmap()
        for (let count = 1; count < MAX_IMAGE_FRAMES; count++) {
          await delay(IMAGE_FRAME_GAP_MS)
          const next = await capture(shown)
          const nextPixels = next.toBitmap()
          image = next
          if (nextPixels.equals(pixels)) break
          pixels = nextPixels
        }
        return { png: new Uint8Array(image.toPNG()) }
      }),
    'capture.frame': (request) =>
      serial(async () => {
        const image = await capture(await show(request))
        const size = image.getSize()
        // NativeImage bitmaps hold premultiplied BGRA pixels.
        return { pixels: bgraToRgba(image.toBitmap()), width: size.width, height: size.height }
      }),
    'capture.close': async ({ sessionId }) => {
      sessions.delete(sessionId)
      if (mounted?.sessionId === sessionId) mounted = null
      return null
    },
  }

  return {
    handlers,
    dispose: () => {
      app.off('browser-window-created', onWindowCreated)
      sessions.clear()
      closeWindow()
    },
  }
}
