import { describe, expect, it } from 'vitest'
import { createFlow } from '@/model/defaults'
import type { Flow, FlowPath, ParallelTarget, Step, Target } from '@/model/schema'
import { buildArcTable } from '@/engine/path-sampler'
import { compileFlow, laneWindow, type EdgeEnds } from './compile'
import { evaluateFlow, type FlowGeometry } from './evaluate'
import { sideIndexAt } from './sides'

const edges: EdgeEnds[] = [
  { id: 'toOne', source: 'app', target: 'one' },
  { id: 'toTwo', source: 'app', target: 'two' },
  { id: 'toWorker', source: 'app', target: 'worker', data: { noReply: true } },
]
const nodeIds = new Set(['app', 'one', 'two', 'worker'])

function step(kind: Target['kind'], id: string, parallel: ParallelTarget[] = [], extra: Partial<Step> = {}): Step {
  return {
    id: `${kind}-${id}`,
    target: { kind, id },
    caption: '',
    durationMs: 1000,
    camera: 'follow',
    zoom: 1,
    event: '',
    latencyMs: null,
    level: 'info',
    ...(parallel.length > 0 ? { parallel } : {}),
    ...extra,
  }
}

const fan = { ...step('edge', 'toOne', [{ kind: 'edge', id: 'toTwo' }]), id: 'fan' }
const join = { ...step('edge', 'toOne', [{ kind: 'edge', id: 'toTwo', delayMs: 2000 }]), id: 'join' }
const done = { ...step('node', 'app'), id: 'done' }

function flowWith(steps: Step[], paths: FlowPath[] = []): Flow {
  return { ...createFlow('Replies'), steps, paths }
}

const rects = {
  app: { x: 0, y: 0, width: 100, height: 50 },
  one: { x: 300, y: -100, width: 100, height: 50 },
  two: { x: 300, y: 100, width: 100, height: 50 },
  worker: { x: 600, y: 0, width: 100, height: 50 },
}
const tables = {
  toOne: buildArcTable('M100,25 L300,-75'),
  toTwo: buildArcTable('M100,25 L300,125'),
  toWorker: buildArcTable('M100,25 L600,25'),
}
const geometry: FlowGeometry = {
  nodeRect: (id) => rects[id as keyof typeof rects] ?? null,
  edgeTable: (id) => tables[id as keyof typeof tables] ?? null,
  bounds: () => ({ x: 0, y: -100, width: 700, height: 250 }),
}
const view = { width: 1200, height: 800 }

function frameAt(flow: Flow, timeMs: number, camera = false) {
  return evaluateFlow(compileFlow(flow, nodeIds, edges), timeMs, geometry, view, { camera })
}

function secondToken(flow: Flow, timeMs: number) {
  return frameAt(flow, timeMs).parallelTokens.find((token) => token.lane === 1)!
}

describe('lane delays in the timeline', () => {
  it('ends a step when its slowest token arrives, so the next step waits for it', () => {
    const timeline = compileFlow(flowWith([fan, join, done]), nodeIds, edges)
    expect(timeline.segments.map((segment) => [segment.step.id, segment.startMs, segment.endMs])).toEqual([
      ['fan', 0, 1000],
      ['join', 1000, 4000],
      ['done', 4000, 5000],
    ])
    expect(timeline.durationMs).toBe(5000)
  })

  it('gives each lane the step duration from the end of its delay', () => {
    const late = { ...join, delayMs: 500 }
    const segment = compileFlow(flowWith([fan, late, done]), nodeIds, edges).segments[1]!
    expect(segment.lanes.map((lane) => [lane.target.id, lane.delayMs, lane.reversed])).toEqual([
      ['toOne', 500, true],
      ['toTwo', 2000, true],
    ])
    expect(segment.lanes.map((lane) => laneWindow(segment, lane))).toEqual([
      { startMs: 1500, endMs: 2500 },
      { startMs: 3000, endMs: 4000 },
    ])
    expect(segment.endMs).toBe(4000)
  })

  it('starts a side path after a step with a delay when the last token of that step arrives', () => {
    const worker: FlowPath = {
      id: 'p-worker',
      name: 'Worker',
      fromStep: 'join',
      steps: [step('edge', 'toWorker')],
      rejoinStep: null,
      concurrent: true,
    }
    const timeline = compileFlow(flowWith([fan, join, done], [worker]), nodeIds, edges)
    const [track] = timeline.sides
    expect(track!.segments.map((segment) => [segment.startMs, segment.endMs])).toEqual([[4000, 5000]])
    expect(sideIndexAt(timeline, track!, 3999)).toBe(-1)
    expect(sideIndexAt(timeline, track!, 4000)).toBe(0)
  })

  it('plays a step without delays as before', () => {
    const zero = { ...join, delayMs: 0, parallel: [{ kind: 'edge' as const, id: 'toTwo', delayMs: 0 }] }
    const plain = { ...join, parallel: [{ kind: 'edge' as const, id: 'toTwo' }] }
    for (const timeMs of [0, 1200, 1500, 1999, 2400]) {
      expect(frameAt(flowWith([fan, zero, done]), timeMs, true)).toEqual(
        frameAt(flowWith([fan, plain, done]), timeMs, true),
      )
    }
  })
})

describe('lane delays in a frame', () => {
  const flow = flowWith([fan, join, done])

  it('keeps a waiting token over its start node, with the node active and its edge as before', () => {
    const frame = frameAt(flow, 2000)
    expect(frame.segmentIndex).toBe(1)
    const waiting = secondToken(flow, 2000)
    expect(waiting.point.x).toBeCloseTo(300)
    expect(waiting.point.y).toBeGreaterThanOrEqual(100)
    expect(waiting.point.y).toBeLessThan(125)
    expect(waiting.lift).toBeCloseTo(1)
    expect(waiting.label).toBeCloseTo(1)
    expect(frame.activeNodes.has('two')).toBe(true)
    expect(frame.activeEdges.has('toTwo')).toBe(false)
    expect(frame.visitedEdges.has('toTwo')).toBe(true)
    expect(frame.activeEdges.has('toOne')).toBe(true)
  })

  it('starts the wait where the call arrived and ends it at the start of the reply', () => {
    for (const timeMs of [1000, 2999]) {
      const { point } = secondToken(flow, timeMs)
      expect(point.x).toBeCloseTo(300)
      expect(point.y).toBeCloseTo(125, 0)
    }
  })

  it('rests an early token at the end of its edge until the step ends', () => {
    for (const timeMs of [2000, 2500, 3999]) {
      const frame = frameAt(flow, timeMs)
      expect(frame.token!.x).toBeCloseTo(100)
      expect(frame.token!.y).toBeCloseTo(25)
      expect(frame.activeEdges.has('toOne')).toBe(true)
    }
  })

  it('moves the late token after its delay, and plays the next step when it arrives', () => {
    const moving = frameAt(flow, 3500)
    const late = secondToken(flow, 3500)
    expect(late.point.x).toBeGreaterThan(100)
    expect(late.point.x).toBeLessThan(300)
    expect(late.lift).toBeCloseTo(0)
    expect(moving.activeEdges.has('toTwo')).toBe(true)
    expect(moving.activeNodes.has('two')).toBe(false)
    expect(frameAt(flow, 3999).segmentIndex).toBe(1)
    expect(frameAt(flow, 4000).segmentIndex).toBe(2)
  })

  it('waits a node token at the end of the edge that enters its node', () => {
    const work = { ...step('node', 'one', [{ kind: 'node', id: 'two', delayMs: 1000 }]), id: 'work' }
    const working = flowWith([fan, work])
    expect(compileFlow(working, nodeIds, edges).segments[1]!.endMs).toBe(3000)
    const { point, lift } = secondToken(working, 1500)
    expect(point.x).toBeCloseTo(300)
    expect(point.y).toBeCloseTo(125)
    expect(lift).toBeCloseTo(0)
    expect(secondToken(working, 2500).lift).toBeCloseTo(1)
  })

  it('gives the same frame for the same time', () => {
    const first = frameAt(flow, 2200, true)
    frameAt(flow, 3600, true)
    expect(frameAt(flow, 2200, true)).toEqual(first)
  })
})
