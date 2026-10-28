import { motionValue } from 'motion'
import type { LogLevel, Target, Traffic, XY } from '@/model/schema'
import { applyFlowFrame, flowStateKey } from './apply'
import { blendCameras, cameraToViewport, viewportToCamera, type Rect, type ViewSize, type Viewport } from './camera'
import { createClock } from './clock'
import { clamp01, easeInOutCubic } from './easing'
import type { Timeline } from './flow/compile'
import { evaluateFlow, type FlowFrame, type FlowGeometry } from './flow/evaluate'
import { pointAt, type ArcTable, type PathPoint } from './path-sampler'
import { COMET_TRAIL, dashPattern, marchOffsetPx, particleProgress } from './traffic'

export interface TrafficBinding {
  table: ArcTable
  traffic: Traffic
  seed: number
  count: number
  /**
   * The SVG elements of the traffic:
   *
   * - `dots`: one circle for each particle.
   * - `comets`: a head circle, then the trail circles, for each particle.
   * - `dashes` and `pulse`: one path.
   */
  elements: SVGElement[]
}

export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface EngineBindingTarget {
  root: HTMLElement
  geometry: FlowGeometry
  visibleRect: () => Rect | null
  setViewport: (viewport: Viewport) => void
  getViewport: () => Viewport
}

export interface CaptionLane {
  target: Target
  /** True if the token moves from the edge target to the edge source. */
  reversed: boolean
}

export interface Caption extends CaptionLane {
  text: string
  index: number
  total: number
  /** The main target first, then the parallel targets. */
  lanes: CaptionLane[]
  event: string
  level: LogLevel
  /** True if the log line of an edge step shows the body of the edge. */
  bodies: boolean
}

const MAX_FRAME_DELTA_MS = 1000
const END_FADE = 0.06
const CULL_MARGIN_PX = 40
const LABEL_VISIBLE = 0.05
const DOT_CLEAR_PX = 6
const HANDOFF_MS = 700

/** The state of a playback at one moment. A change gives a new object. */
export interface PlaybackSnapshot {
  flowId: string | null
  timeline: Timeline | null
  playing: boolean
  rate: number
  follow: boolean
  durationMs: number
}

export class Playback {
  readonly time = motionValue(0)
  flowId: string | null = null
  timeline: Timeline | null = null
  playing = false
  rate = 1
  follow = true
  /** If true, the next frame moves the camera one time, also during a pause. */
  cameraRequest = false
  /** If true, the next frames move the camera from the current viewport to the flow camera. */
  handoffRequest = false
  private listeners = new Set<() => void>()
  private snapshot = this.takeSnapshot()

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): PlaybackSnapshot => this.snapshot

  private takeSnapshot(): PlaybackSnapshot {
    const { flowId, timeline, playing, rate, follow, durationMs } = this
    return { flowId, timeline, playing, rate, follow, durationMs }
  }

  private notify() {
    this.snapshot = this.takeSnapshot()
    for (const listener of this.listeners) listener()
  }

  get durationMs() {
    return this.timeline?.durationMs ?? 0
  }

  load(flowId: string | null, timeline: Timeline | null) {
    const changed = flowId !== this.flowId
    this.flowId = flowId
    this.timeline = timeline
    if (changed) {
      this.playing = false
      this.time.set(0)
    } else if (timeline && this.time.get() > timeline.durationMs) {
      this.time.set(timeline.durationMs)
    }
    this.notify()
  }

  play() {
    if (!this.timeline) return
    if (this.time.get() >= this.durationMs) this.time.set(0)
    if (!this.playing) this.handoffRequest = true
    this.playing = true
    this.notify()
  }

  pause() {
    this.playing = false
    this.notify()
  }

  toggle() {
    if (this.playing) this.pause()
    else this.play()
  }

  seek(timeMs: number) {
    this.time.set(Math.max(0, Math.min(this.durationMs, timeMs)))
    this.cameraRequest = true
    this.handoffRequest = true
    this.notify()
  }

  setRate(rate: number) {
    this.rate = rate
    this.notify()
  }

  setFollow(follow: boolean) {
    this.follow = follow
    this.notify()
  }

  tick(deltaMs: number) {
    if (!this.playing || !this.timeline) return
    let next = this.time.get() + deltaMs * this.rate
    if (next >= this.durationMs) {
      if (this.timeline.flow.loop && this.durationMs > 0) {
        next %= this.durationMs
      } else {
        next = this.durationMs
        this.playing = false
        this.notify()
      }
    }
    this.time.set(next)
  }
}

/** The animation state of one canvas. Each React Flow instance has its own engine. */
export class Engine {
  readonly ambient = createClock()
  readonly playback = new Playback()
  readonly tables = new Map<string, ArcTable>()
  private root: HTMLElement | null = null
  private tokenElement: HTMLElement | null = null
  /** Copies of the token element for the parallel targets of a step. */
  private parallelTokenElements: HTMLElement[] = []
  private geometry: FlowGeometry | null = null
  private visibleRect: (() => Rect | null) | null = null
  private setViewport: ((viewport: Viewport) => void) | null = null
  private getViewport: (() => Viewport) | null = null
  private handoff: { from: Viewport; startedAt: number } | null = null
  private edgeProtocols = new Map<string, string | null>()
  private viewSize: ViewSize = { width: 0, height: 0 }
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }
  /** If true, the engine does not advance the clocks. The export sets the time for each frame. */
  manual = false
  /** If true, the flow camera goes directly to each step. */
  reducedMotion = false

  private traffic = new Map<string, TrafficBinding>()
  private trafficScale = new Map<string, number>()
  private caption: Caption | null = null
  private captionListeners = new Set<() => void>()
  private flowShown = false
  private flowDirty = true
  private lastFlowMs = -1
  private lastTimeline: Timeline | null = null
  /** The flow state that the DOM shows, or `null` if the next frame must write it. */
  private shownState: string | null = null
  private tokenShown = false
  private tokenLabelShown = false
  private point: PathPoint = { x: 0, y: 0, angleRad: 0 }
  private frameRequest = 0
  private lastTimestamp: number | null = null

  get view(): ViewSize {
    return this.viewSize
  }

  /** Connects the engine to the DOM and the viewport of one React Flow instance. */
  attach(target: EngineBindingTarget) {
    this.root = target.root
    this.geometry = target.geometry
    this.visibleRect = target.visibleRect
    this.setViewport = target.setViewport
    this.getViewport = target.getViewport
    this.flowDirty = true
  }

  detach() {
    this.root = null
    this.geometry = null
    this.visibleRect = null
    this.setViewport = null
    this.getViewport = null
  }

  setView(view: ViewSize) {
    this.viewSize = view
    this.flowDirty = true
  }

  /**
   * Sets the screen pixels at each side of the view that panels cover.
   *
   * The flow camera centers its target in the free area.
   */
  setInsets(insets: Insets) {
    this.insets = insets
    this.flowDirty = true
  }

  setReducedMotion(reducedMotion: boolean) {
    this.reducedMotion = reducedMotion
    this.flowDirty = true
  }

  setTokenElement(element: HTMLElement | null) {
    this.tokenElement = element
    this.removeParallelTokens()
    this.flowDirty = true
  }

  private removeParallelTokens() {
    for (const element of this.parallelTokenElements) element.remove()
    this.parallelTokenElements = []
  }

  private parallelTokenElement(index: number): HTMLElement | null {
    const template = this.tokenElement
    if (!template?.parentElement) return null
    let element = this.parallelTokenElements[index]
    if (!element) {
      element = template.cloneNode(true) as HTMLElement
      element.dataset.parallel = ''
      template.after(element)
      this.parallelTokenElements[index] = element
    }
    return element
  }

  registerTraffic(edgeId: string, binding: TrafficBinding) {
    this.traffic.set(edgeId, binding)
    this.renderTrafficFor(binding, this.trafficScale.get(edgeId) ?? 1, this.ambient.time.get())
  }

  unregisterTraffic(edgeId: string) {
    this.traffic.delete(edgeId)
  }

  subscribeCaption = (listener: () => void) => {
    this.captionListeners.add(listener)
    return () => this.captionListeners.delete(listener)
  }

  getCaption = () => this.caption

  start() {
    if (this.frameRequest) return
    this.lastTimestamp = null
    this.frameRequest = requestAnimationFrame(this.loop)
  }

  stop() {
    cancelAnimationFrame(this.frameRequest)
    this.frameRequest = 0
  }

  /** Stops the frame loop after one last render, so the page shows the current state of both clocks. */
  pause() {
    this.stop()
    if (!this.manual) this.render(this.ambient.time.get(), this.playback.time.get())
  }

  private loop = (timestamp: number) => {
    this.frameRequest = requestAnimationFrame(this.loop)
    const delta = this.lastTimestamp === null ? 0 : Math.min(MAX_FRAME_DELTA_MS, timestamp - this.lastTimestamp)
    this.lastTimestamp = timestamp
    if (this.manual) return
    this.ambient.advance(delta)
    this.playback.tick(delta)
    this.render(this.ambient.time.get(), this.playback.time.get())
  }

  /** Renders the traffic and the flow state for the two clock values. */
  render(ambientMs: number, flowMs: number) {
    this.renderFlow(flowMs)
    this.renderTraffic(ambientMs)
  }

  renderTraffic(timeMs: number) {
    const visible = this.visibleRect?.() ?? null
    for (const [edgeId, binding] of this.traffic) {
      if (visible) {
        const { table } = binding
        if (
          table.maxX < visible.x - CULL_MARGIN_PX ||
          table.minX > visible.x + visible.width + CULL_MARGIN_PX ||
          table.maxY < visible.y - CULL_MARGIN_PX ||
          table.minY > visible.y + visible.height + CULL_MARGIN_PX
        ) {
          continue
        }
      }
      this.renderTrafficFor(binding, this.trafficScale.get(edgeId) ?? 1, timeMs)
    }
  }

  private renderTrafficFor(binding: TrafficBinding, scale: number, timeMs: number) {
    const { table, traffic, seed, count, elements } = binding
    const length = table.lengthPx
    if (length <= 0) return

    if (traffic.style === 'dashes' || traffic.style === 'pulse') {
      const path = elements[0]
      if (!path) return
      const { dash, gap } = dashPattern(traffic, length)
      path.setAttribute('stroke-dashoffset', marchOffsetPx(traffic, seed, timeMs, dash + gap).toFixed(2))
      path.setAttribute('opacity', scale.toFixed(3))
      return
    }

    const comet = traffic.style === 'comets'
    const stride = comet ? 1 + COMET_TRAIL.length : 1
    for (let i = 0; i < count; i++) {
      const u = particleProgress(traffic, seed, i, count, timeMs, length)
      const reverse = traffic.direction === 'reverse' || (traffic.direction === 'both' && i % 2 === 1)
      const fade = Math.min(1, u / END_FADE, (1 - u) / END_FADE) * scale
      const head = elements[i * stride]
      if (!head) continue
      pointAt(table, u, this.point)
      head.setAttribute('cx', this.point.x.toFixed(2))
      head.setAttribute('cy', this.point.y.toFixed(2))
      head.setAttribute('opacity', fade.toFixed(3))
      if (!comet) continue
      for (let k = 0; k < COMET_TRAIL.length; k++) {
        const trail = COMET_TRAIL[k]!
        const element = elements[i * stride + 1 + k]
        if (!element) continue
        const trailU = u + ((reverse ? 1 : -1) * trail.offsetPx) / length
        pointAt(table, trailU, this.point)
        element.setAttribute('cx', this.point.x.toFixed(2))
        element.setAttribute('cy', this.point.y.toFixed(2))
        element.setAttribute('opacity', (trailU < 0 || trailU > 1 ? 0 : fade * trail.opacity).toFixed(3))
      }
    }
  }

  private setCaption(next: Caption | null) {
    const previous = this.caption
    if (
      previous?.text === next?.text &&
      previous?.index === next?.index &&
      previous?.total === next?.total &&
      previous?.target.id === next?.target.id &&
      previous?.reversed === next?.reversed &&
      previous?.event === next?.event &&
      previous?.level === next?.level &&
      previous?.bodies === next?.bodies
    ) {
      return
    }
    this.caption = next
    for (const listener of this.captionListeners) listener()
  }

  clearFlow() {
    if (this.root) applyFlowFrame(this.root, null, false)
    this.coverEdgeLabels(false, false)
    if (this.tokenElement) this.tokenElement.style.display = 'none'
    for (const element of this.parallelTokenElements) element.style.display = 'none'
    this.trafficScale.clear()
    this.setCaption(null)
    this.flowShown = false
    this.lastTimeline = null
    this.shownState = null
    this.tokenShown = false
    this.tokenLabelShown = false
  }

  private coverEdgeLabels(tokenShown: boolean, tokenLabelShown: boolean) {
    if (!this.root) return
    const mark = tokenShown
      ? this.tokenElement?.querySelector(tokenLabelShown ? '.dg-token-chip' : '.dg-token-dot')
      : null
    const markBox = mark?.getBoundingClientRect()
    if (!markBox) {
      for (const label of this.root.querySelectorAll('.dg-edge-label[data-covered]'))
        label.removeAttribute('data-covered')
      return
    }
    const margin = tokenLabelShown ? 0 : DOT_CLEAR_PX
    const left = markBox.left - margin
    const right = markBox.right + margin
    const top = markBox.top - margin
    const bottom = markBox.bottom + margin
    const labels = Array.from(this.root.querySelectorAll<HTMLElement>('.dg-edge-label'))
    const covered = labels.map((label) => {
      const rect = label.getBoundingClientRect()
      return rect.left < right && rect.right > left && rect.top < bottom && rect.bottom > top
    })
    labels.forEach((label, index) => {
      if (covered[index] !== label.hasAttribute('data-covered')) label.toggleAttribute('data-covered', covered[index])
    })
  }

  private tokenProtocol(timeline: Timeline, index: number): string | null {
    const { segments } = timeline
    const current = segments[index]
    if (!current) return null
    if (current.step.target.kind === 'edge') return this.edgeProtocol(current.step.target.id)
    for (let i = index - 1; i >= 0; i--) {
      const segment = segments[i]!
      if (segment.step.target.kind === 'edge') return this.edgeProtocol(segment.step.target.id)
    }
    const next = segments.slice(index + 1).find((segment) => segment.step.target.kind === 'edge')
    return next ? this.edgeProtocol(next.step.target.id) : null
  }

  private laneProtocol(timeline: Timeline, index: number, laneIndex: number): string | null {
    const lane = timeline.segments[index]?.lanes[laneIndex]
    if (!lane) return null
    if (lane.target.kind === 'edge') return this.edgeProtocol(lane.target.id)
    const entry = timeline.segments[index - 1]?.lanes.find(
      (candidate) => candidate.target.kind === 'edge' && candidate.toNode === lane.toNode,
    )
    return entry ? this.edgeProtocol(entry.target.id) : this.tokenProtocol(timeline, index)
  }

  private placeToken(element: HTMLElement, protocol: string | null, point: XY, lift: number, label: number) {
    if ((element.dataset.protocol ?? null) !== protocol) {
      if (protocol) element.dataset.protocol = protocol
      else delete element.dataset.protocol
    }
    element.style.display = ''
    element.style.transform = `translate(${point.x.toFixed(2)}px, ${point.y.toFixed(2)}px)`
    element.style.setProperty('--dg-token-lift', lift.toFixed(3))
    element.style.setProperty('--dg-token-label', label.toFixed(3))
  }

  private edgeProtocol(edgeId: string): string | null {
    if (!this.edgeProtocols.has(edgeId)) {
      const edge = this.root?.querySelector(`.react-flow__edge[data-id="${CSS.escape(edgeId)}"] .dg-edge`)
      this.edgeProtocols.set(edgeId, edge?.getAttribute('data-protocol') ?? null)
    }
    return this.edgeProtocols.get(edgeId)!
  }

  /** Makes the next frame write the flow state again. Call it after the diagram changes. */
  invalidate() {
    this.flowDirty = true
    this.shownState = null
    this.edgeProtocols.clear()
  }

  renderFlow(timeMs: number): FlowFrame | null {
    const { timeline } = this.playback
    if (!timeline || !this.geometry || !this.root) {
      if (this.flowShown) this.clearFlow()
      return null
    }
    if (this.playback.handoffRequest) {
      this.playback.handoffRequest = false
      this.handoff =
        this.getViewport && !this.manual && !this.reducedMotion
          ? { from: this.getViewport(), startedAt: performance.now() }
          : null
    }
    const unchanged =
      this.handoff === null &&
      !this.flowDirty &&
      !this.playback.playing &&
      !this.playback.cameraRequest &&
      timeline === this.lastTimeline &&
      timeMs === this.lastFlowMs
    if (unchanged && !this.manual) return null
    this.flowDirty = false
    this.lastFlowMs = timeMs
    if (timeline !== this.lastTimeline) {
      this.shownState = null
      this.removeParallelTokens()
    }
    this.lastTimeline = timeline
    const freeView = {
      width: Math.max(1, this.viewSize.width - this.insets.left - this.insets.right),
      height: Math.max(1, this.viewSize.height - this.insets.top - this.insets.bottom),
    }
    const result = evaluateFlow(timeline, timeMs, this.geometry, freeView, {
      camera: this.playback.follow && this.viewSize.width > 0,
      reducedMotion: this.reducedMotion,
    })
    this.flowShown = true
    // A layout read after a DOM write makes the browser compute style and layout again within the frame.
    if (!this.manual) this.coverEdgeLabels(this.tokenShown, this.tokenLabelShown)
    const state = flowStateKey(result, timeline.flow.spotlight)
    if (state !== this.shownState) {
      applyFlowFrame(this.root, result, timeline.flow.spotlight)
      this.shownState = state
    }
    this.trafficScale = result.trafficScale

    if (this.tokenElement) {
      if (result.token) {
        const protocol = this.tokenProtocol(timeline, result.segmentIndex)
        this.placeToken(this.tokenElement, protocol, result.token, result.tokenLift, result.tokenLabel)
      } else {
        this.tokenElement.style.display = 'none'
      }
    }
    result.parallelTokens.forEach((token, index) => {
      const element = this.parallelTokenElement(index)
      if (!element) return
      const protocol = this.laneProtocol(timeline, result.segmentIndex, token.lane)
      this.placeToken(element, protocol, token.point, token.lift, token.label)
    })
    for (const element of this.parallelTokenElements.slice(result.parallelTokens.length)) {
      element.style.display = 'none'
    }
    this.tokenShown = result.token !== null
    this.tokenLabelShown = result.tokenLabel > LABEL_VISIBLE
    if (this.manual) this.coverEdgeLabels(this.tokenShown, this.tokenLabelShown)

    const moveCamera = this.playback.playing || this.manual || this.playback.cameraRequest || this.handoff !== null
    if (result.camera && this.setViewport && moveCamera) {
      let camera = result.camera
      if (this.handoff) {
        const progress = (performance.now() - this.handoff.startedAt) / HANDOFF_MS
        if (progress >= 1) {
          this.handoff = null
        } else {
          const { from } = this.handoff
          const start = viewportToCamera(
            { x: from.x - this.insets.left, y: from.y - this.insets.top, zoom: from.zoom },
            freeView,
          )
          camera = blendCameras(start, camera, easeInOutCubic(clamp01(progress)), freeView)
        }
      }
      const viewport = cameraToViewport(camera, freeView)
      this.setViewport({ x: viewport.x + this.insets.left, y: viewport.y + this.insets.top, zoom: viewport.zoom })
    } else {
      this.handoff = null
    }
    this.playback.cameraRequest = false

    const segment = timeline.segments[result.segmentIndex]
    this.setCaption(
      segment
        ? {
            text: result.caption,
            index: result.segmentIndex,
            total: timeline.segments.length,
            target: segment.step.target,
            reversed: segment.reversed,
            lanes: segment.lanes.map(({ target, reversed }) => ({ target, reversed })),
            event: segment.step.event,
            level: segment.step.level,
            bodies: timeline.flow.bodies,
          }
        : null,
    )
    return result
  }

  /** Returns the progress of the flow from 0 to 1. */
  progress() {
    const duration = this.playback.durationMs
    return duration > 0 ? clamp01(this.playback.time.get() / duration) : 0
  }
}
