import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFlow, DEFAULT_TRAFFIC } from '@/model/defaults'
import type { Step, Target, Traffic } from '@/model/schema'
import { cameraToViewport, type Rect, type ViewSize, type Viewport } from './camera'
import { Engine, type Caption } from './engine'
import { compileFlow } from './flow/compile'
import { evaluateFlow, type FlowGeometry } from './flow/evaluate'
import { buildArcTable } from './path-sampler'

const HANDOFF_MS = 700

const rects: Record<string, Rect> = {
  a: { x: 0, y: 0, width: 100, height: 50 },
  b: { x: 300, y: 0, width: 100, height: 50 },
  c: { x: 300, y: 300, width: 100, height: 50 },
}
const tables = {
  ab: buildArcTable('M100,25 L300,25'),
  ac: buildArcTable('M50,50 L50,325 L300,325'),
  bc: buildArcTable('M350,50 L350,300'),
}
const geometry: FlowGeometry = {
  nodeRect: (id) => rects[id] ?? null,
  edgeTable: (id) => tables[id as keyof typeof tables] ?? null,
  bounds: () => ({ x: 0, y: 0, width: 400, height: 350 }),
}
const edgeEnds = [
  { id: 'ab', source: 'a', target: 'b' },
  { id: 'ac', source: 'a', target: 'c' },
  { id: 'bc', source: 'b', target: 'c' },
]
const VIEW: ViewSize = { width: 1200, height: 800 }

function step(target: Target, caption: string, parallel?: Target[]): Step {
  return {
    id: `step-${target.id}`,
    target,
    caption,
    event: target.kind === 'edge' ? `GET /${target.id}` : '',
    latencyMs: null,
    level: target.id === 'bc' ? 'warn' : 'info',
    durationMs: 1000,
    camera: 'follow',
    zoom: 1,
    ...(parallel && { parallel }),
  }
}

const flow = {
  ...createFlow('Order'),
  steps: [
    step({ kind: 'node', id: 'a' }, 'Start at A'),
    step({ kind: 'edge', id: 'ab' }, 'A calls B', [{ kind: 'edge', id: 'ac' }]),
    step({ kind: 'node', id: 'b' }, 'B works'),
    step({ kind: 'edge', id: 'bc' }, 'B calls C'),
    step({ kind: 'node', id: 'c' }, 'C answers'),
  ],
}
const timeline = compileFlow(flow, new Set(Object.keys(rects)), edgeEnds)

let root: HTMLElement
let engine: Engine
let viewport: Viewport
let setViewport: ReturnType<typeof vi.fn<(next: Viewport) => void>>
let visible: Rect | null
let nowMs: number

function element(selector: string): HTMLElement {
  return root.querySelector<HTMLElement>(selector)!
}

function flowState(selector: string) {
  return element(selector).getAttribute('data-flow')
}

const token = () => element('.dg-token:not([data-parallel])')
const parallelToken = () => root.querySelector<HTMLElement>('.dg-token[data-parallel]')

function expectAt(target: HTMLElement, point: { x: number; y: number }) {
  const matrix = new DOMMatrixReadOnly(target.style.transform)
  expect(matrix.e).toBeCloseTo(point.x, 2)
  expect(matrix.f).toBeCloseTo(point.y, 2)
}

function flowCamera(timeMs: number, view: ViewSize = VIEW, reducedMotion = false) {
  return evaluateFlow(timeline, timeMs, geometry, view, { camera: true, reducedMotion }).camera!
}

beforeEach(() => {
  root = document.createElement('div')
  root.style.cssText = 'position: fixed; left: 0; top: 0; width: 1200px; height: 800px'
  root.innerHTML = `
    <div class="react-flow__node" data-id="a"></div>
    <div class="react-flow__node" data-id="b"></div>
    <div class="react-flow__node" data-id="c"></div>
    <div class="react-flow__node react-flow__node-group" data-id="g"></div>
    <svg>
      <g class="react-flow__edge" data-id="ab"><path class="dg-edge" data-protocol="http"></path></g>
      <g class="react-flow__edge" data-id="ac"><path class="dg-edge" data-protocol="rpc"></path></g>
      <g class="react-flow__edge" data-id="bc"><path class="dg-edge"></path></g>
    </svg>
    <div class="dg-edge-label" data-dg-edge="ab" style="position: absolute; width: 20px; height: 20px"></div>
    <div class="dg-token" style="position: absolute; left: 0; top: 0">
      <span class="dg-token-dot" style="position: absolute; left: 0; top: 0; width: 8px; height: 8px"></span>
      <span class="dg-token-chip" style="position: absolute; left: 0; top: 0; width: 40px; height: 16px"></span>
    </div>`
  document.body.append(root)

  nowMs = 10_000
  vi.spyOn(performance, 'now').mockImplementation(() => nowMs)
  viewport = { x: 0, y: 0, zoom: 1 }
  visible = null
  setViewport = vi.fn((next: Viewport) => {
    viewport = next
  })
  engine = new Engine()
  engine.attach({
    root,
    geometry,
    visibleRect: () => visible,
    setViewport,
    getViewport: () => viewport,
  })
  engine.setView(VIEW)
  engine.setTokenElement(element('.dg-token'))
  engine.playback.load(flow.id, timeline)
})

afterEach(() => {
  engine.stop()
  root.remove()
  vi.restoreAllMocks()
})

describe('Engine flow state', () => {
  it('marks the active, visited and idle nodes, edges and labels of a step', () => {
    engine.manual = true
    engine.renderFlow(1500)
    expect(flowState('.react-flow__edge[data-id="ab"]')).toBe('active')
    expect(flowState('.react-flow__edge[data-id="ac"]')).toBe('active')
    expect(flowState('.react-flow__edge[data-id="bc"]')).toBe('idle')
    expect(flowState('[data-dg-edge="ab"]')).toBe('active')
    expect(flowState('.react-flow__node[data-id="a"]')).toBe('visited')
    expect(flowState('.react-flow__node[data-id="b"]')).toBe('idle')
    expect(flowState('.react-flow__node[data-id="g"]')).toBeNull()

    engine.renderFlow(2500)
    expect(flowState('.react-flow__node[data-id="b"]')).toBe('active')
    expect(flowState('.react-flow__edge[data-id="ab"]')).toBe('visited')
  })

  it('places the token and a copy for each parallel target, in the colour of their edges', () => {
    engine.manual = true
    const frame = engine.renderFlow(1500)!
    expectAt(token(), frame.token!)
    expect(token().style.display).toBe('')
    expect(token().dataset.protocol).toBe('http')

    const copy = parallelToken()!
    expect(copy.previousElementSibling).toBe(token())
    expectAt(copy, frame.parallelTokens[0]!.point)
    expect(copy.dataset.protocol).toBe('rpc')

    engine.renderFlow(2500)
    expect(token().dataset.protocol).toBe('http')
    expect(parallelToken()!.style.display).toBe('none')
    engine.renderFlow(3500)
    expect(token().dataset.protocol).toBeUndefined()
  })

  it('takes the token colour from the next edge before the first edge step', () => {
    engine.manual = true
    engine.renderFlow(500)
    expect(token().dataset.protocol).toBe('http')
  })

  it('tells caption listeners about a new step, and not about each frame of a step', () => {
    engine.manual = true
    const captions: (Caption | null)[] = []
    engine.subscribeCaption(() => captions.push(engine.getCaption()))
    engine.renderFlow(1200)
    engine.renderFlow(1800)
    expect(captions).toEqual([
      {
        text: 'A calls B',
        index: 1,
        total: 5,
        target: { kind: 'edge', id: 'ab' },
        reversed: false,
        lanes: [
          { target: { kind: 'edge', id: 'ab' }, reversed: false },
          { target: { kind: 'edge', id: 'ac' }, reversed: false },
        ],
        event: 'GET /ab',
        level: 'info',
        bodies: true,
      },
    ])
    engine.renderFlow(3500)
    expect(captions).toHaveLength(2)
    expect(captions[1]).toMatchObject({ index: 3, level: 'warn', event: 'GET /bc' })
  })

  it('removes all flow state when the flow unloads', () => {
    engine.manual = true
    engine.renderFlow(1500)
    engine.playback.load(null, null)
    expect(engine.renderFlow(0)).toBeNull()
    expect(root.querySelectorAll('[data-flow]')).toHaveLength(0)
    expect(token().style.display).toBe('none')
    expect(parallelToken()!.style.display).toBe('none')
    expect(engine.getCaption()).toBeNull()
  })

  it('writes the state again after an invalidate, and re-reads the edge colours', () => {
    engine.renderFlow(2500)
    element('.react-flow__node[data-id="b"]').removeAttribute('data-flow')
    element('.react-flow__edge[data-id="ab"] .dg-edge').setAttribute('data-protocol', 'messaging')
    expect(engine.renderFlow(2500)).toBeNull()
    expect(flowState('.react-flow__node[data-id="b"]')).toBeNull()

    engine.invalidate()
    expect(engine.renderFlow(2500)).not.toBeNull()
    expect(flowState('.react-flow__node[data-id="b"]')).toBe('active')
    expect(token().dataset.protocol).toBe('messaging')
  })

  it('marks the edge labels under the token', () => {
    engine.manual = true
    const point = engine.renderFlow(1500)!.token!
    const label = element('.dg-edge-label')
    label.style.left = `${point.x - 5}px`
    label.style.top = `${point.y - 5}px`
    engine.renderFlow(1500)
    expect(label.hasAttribute('data-covered')).toBe(true)

    label.style.left = `${point.x + 500}px`
    engine.renderFlow(1500)
    expect(label.hasAttribute('data-covered')).toBe(false)
  })

  it('reports the progress of the flow', () => {
    expect(engine.progress()).toBe(0)
    engine.playback.seek(1500)
    expect(engine.progress()).toBe(0.3)
    engine.playback.load(null, null)
    expect(engine.progress()).toBe(0)
  })

  it('renders no flow after it detaches', () => {
    engine.manual = true
    engine.renderFlow(1500)
    engine.detach()
    expect(engine.renderFlow(1500)).toBeNull()
    expect(engine.getCaption()).toBeNull()
    expect(token().style.display).toBe('none')
  })

  it('removes the parallel token copies when the token element changes', () => {
    engine.manual = true
    engine.renderFlow(1500)
    expect(parallelToken()).not.toBeNull()
    engine.setTokenElement(null)
    expect(parallelToken()).toBeNull()
  })
})

describe('Engine camera', () => {
  it('moves the camera at each export frame', () => {
    engine.manual = true
    engine.renderFlow(1500)
    expect(setViewport).toHaveBeenLastCalledWith(cameraToViewport(flowCamera(1500), VIEW))
    engine.renderFlow(3500)
    expect(setViewport).toHaveBeenLastCalledWith(cameraToViewport(flowCamera(3500), VIEW))
  })

  it('centres the flow camera in the area that panels leave free', () => {
    engine.manual = true
    engine.setInsets({ top: 60, right: 0, bottom: 0, left: 200 })
    engine.renderFlow(1500)
    const free = { width: VIEW.width - 200, height: VIEW.height - 60 }
    const expected = cameraToViewport(flowCamera(1500, free), free)
    expect(setViewport).toHaveBeenLastCalledWith({ x: expected.x + 200, y: expected.y + 60, zoom: expected.zoom })
  })

  it('keeps the viewport of a paused flow', () => {
    engine.renderFlow(1500)
    expect(setViewport).not.toHaveBeenCalled()
  })

  it('does not move the camera when the flow camera is off', () => {
    engine.manual = true
    engine.playback.setFollow(false)
    expect(engine.renderFlow(1500)!.camera).toBeNull()
    expect(setViewport).not.toHaveBeenCalled()
  })

  it('glides from the current viewport to the flow camera after a seek', () => {
    viewport = { x: 40, y: 30, zoom: 0.5 }
    const start = viewport
    engine.playback.seek(1500)
    engine.renderFlow(1500)
    const first = setViewport.mock.lastCall![0]
    expect(first.x).toBeCloseTo(start.x, 6)
    expect(first.y).toBeCloseTo(start.y, 6)
    expect(first.zoom).toBeCloseTo(start.zoom, 6)

    nowMs += HANDOFF_MS / 2
    engine.renderFlow(1500)
    const target = cameraToViewport(flowCamera(1500), VIEW)
    const middle = setViewport.mock.lastCall![0]
    expect(middle).not.toEqual(first)
    expect(middle).not.toEqual(target)

    nowMs += HANDOFF_MS / 2
    engine.renderFlow(1500)
    expect(setViewport).toHaveBeenLastCalledWith(target)

    const calls = setViewport.mock.calls.length
    expect(engine.renderFlow(1500)).toBeNull()
    expect(setViewport).toHaveBeenCalledTimes(calls)
  })

  it('cuts to the flow camera with reduced motion', () => {
    viewport = { x: 40, y: 30, zoom: 0.5 }
    engine.setReducedMotion(true)
    engine.playback.seek(1500)
    engine.renderFlow(1500)
    expect(setViewport).toHaveBeenLastCalledWith(cameraToViewport(flowCamera(1500, VIEW, true), VIEW))
  })

  it('fades the canvas around a camera cut with reduced motion', () => {
    const small = { width: 300, height: 200 }
    engine.manual = true
    engine.setView(small)
    engine.setReducedMotion(true)
    let dipMs = -1
    let opacity = 1
    for (let time = 0; time <= timeline.durationMs && dipMs < 0; time += 10) {
      const frame = evaluateFlow(timeline, time, geometry, small, { camera: true, reducedMotion: true })
      if (frame.viewOpacity < 1) {
        dipMs = time
        opacity = frame.viewOpacity
      }
    }
    expect(dipMs).toBeGreaterThan(0)
    engine.renderFlow(dipMs)
    expect(root.style.getPropertyValue('--dg-view-opacity')).toBe(opacity.toFixed(3))
    engine.renderFlow(0)
    expect(root.style.getPropertyValue('--dg-view-opacity')).toBe('')
  })
})

describe('Engine traffic', () => {
  function circles(count: number) {
    const svg = element('svg')
    return Array.from({ length: count }, () => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      svg.append(circle)
      return circle
    })
  }

  const dots: Traffic = { ...DEFAULT_TRAFFIC, enabled: true, style: 'dots', speed: 90 }

  it('places the dots along the edge at once, and moves them with the ambient time', () => {
    const [first, second] = circles(2)
    engine.registerTraffic('ab', { table: tables.ab, traffic: dots, seed: 0.25, count: 2, elements: [first!, second!] })
    expect(Number(first!.getAttribute('cx'))).toBeCloseTo(150, 0)
    expect(Number(second!.getAttribute('cx'))).toBeCloseTo(250, 0)
    expect(first!.getAttribute('cy')).toBe('25.00')
    expect(first!.getAttribute('opacity')).toBe('1.000')

    engine.renderTraffic(1000)
    expect(Number(first!.getAttribute('cx'))).toBeCloseTo(240, 0)
    expect(Number(second!.getAttribute('cx'))).toBeCloseTo(140, 0)
  })

  it('fades a dot near the ends of the edge', () => {
    const [dot] = circles(1)
    engine.registerTraffic('ab', { table: tables.ab, traffic: dots, seed: 0.97, count: 1, elements: [dot!] })
    expect(Number(dot!.getAttribute('opacity'))).toBeCloseTo(0.5, 2)
  })

  it('draws a trail behind each comet head', () => {
    const elements = circles(4)
    const comets: Traffic = { ...dots, style: 'comets' }
    engine.registerTraffic('ab', { table: tables.ab, traffic: comets, seed: 0.5, count: 1, elements })
    const xs = elements.map((circle) => Number(circle.getAttribute('cx')))
    expect(xs[0]).toBeCloseTo(200, 0)
    expect(xs[1]).toBeLessThan(xs[0]!)
    expect(xs[2]).toBeLessThan(xs[1]!)
    expect(xs[3]).toBeLessThan(xs[2]!)
    expect(elements.map((circle) => circle.getAttribute('opacity'))).toEqual(['1.000', '0.550', '0.300', '0.140'])
  })

  it('moves the dashes of an edge with the time', () => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    const dashes: Traffic = { ...dots, style: 'dashes' }
    engine.registerTraffic('ab', { table: tables.ab, traffic: dashes, seed: 0, count: 0, elements: [path] })
    expect(path.getAttribute('stroke-dashoffset')).toBe('0.00')
    expect(path.getAttribute('opacity')).toBe('1.000')
    engine.renderTraffic(100)
    expect(Number(path.getAttribute('stroke-dashoffset'))).toBeLessThan(0)
  })

  it('skips the traffic of an edge outside the visible area, and of an edge that it no longer has', () => {
    const [dot] = circles(1)
    engine.registerTraffic('ab', { table: tables.ab, traffic: dots, seed: 0.25, count: 1, elements: [dot!] })
    const shown = dot!.getAttribute('cx')
    visible = { x: 2000, y: 2000, width: 500, height: 500 }
    engine.renderTraffic(1000)
    expect(dot!.getAttribute('cx')).toBe(shown)

    visible = { x: 0, y: 0, width: 500, height: 500 }
    engine.unregisterTraffic('ab')
    engine.renderTraffic(1000)
    expect(dot!.getAttribute('cx')).toBe(shown)
  })
})

describe('Engine frame loop', () => {
  let frames: FrameRequestCallback[]

  function runFrame(timestampMs: number) {
    frames.shift()!(timestampMs)
  }

  beforeEach(() => {
    frames = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
      frames = []
    })
  })

  it('advances both clocks by the frame time and renders each frame', () => {
    engine.start()
    engine.start()
    expect(frames).toHaveLength(1)
    engine.playback.play()
    runFrame(1000)
    expect(engine.ambient.time.get()).toBe(0)
    runFrame(1016)
    expect(engine.ambient.time.get()).toBe(16)
    expect(engine.playback.time.get()).toBe(16)
    expect(flowState('.react-flow__node[data-id="a"]')).toBe('active')
  })

  it('limits the time of one frame after a long gap', () => {
    engine.start()
    runFrame(1000)
    runFrame(9000)
    expect(engine.ambient.time.get()).toBe(1000)
  })

  it('does not advance the clocks in manual mode', () => {
    engine.manual = true
    engine.playback.play()
    engine.start()
    runFrame(1000)
    runFrame(1016)
    expect(engine.ambient.time.get()).toBe(0)
    expect(engine.playback.time.get()).toBe(0)
  })

  it('starts each run with a new frame clock, so the flow goes on where it stopped', () => {
    engine.start()
    runFrame(1000)
    runFrame(1100)
    engine.stop()
    expect(frames).toHaveLength(0)
    engine.start()
    runFrame(60_000)
    expect(engine.ambient.time.get()).toBe(100)
  })

  it('renders the current state once when it pauses', () => {
    engine.start()
    engine.playback.seek(2500)
    engine.pause()
    expect(frames).toHaveLength(0)
    expect(flowState('.react-flow__node[data-id="b"]')).toBe('active')
  })

  it('renders nothing when it pauses in manual mode', () => {
    engine.manual = true
    engine.playback.seek(2500)
    engine.pause()
    expect(flowState('.react-flow__node[data-id="b"]')).toBeNull()
  })
})
