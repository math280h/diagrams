import { describe, expect, it } from 'vitest'
import { createFlow } from '@/model/defaults'
import { pathSteps } from '@/model/flow'
import type { Flow, FlowPath, Step, Target } from '@/model/schema'
import { buildArcTable } from '@/engine/path-sampler'
import { findEdgePath, joinEdges, nearestToken } from '@/engine/route'
import { compileFlow, edgeTravel, type EdgeEnds } from './compile'
import { evaluateFlow, type FlowGeometry } from './evaluate'
import { cameraTimeline, findSegment, sideIndexAt } from './sides'

const edges: EdgeEnds[] = [
  { id: 'toOne', source: 'app', target: 'one' },
  { id: 'toTwo', source: 'app', target: 'two', data: { noReply: true } },
  { id: 'toQueue', source: 'two', target: 'queue', data: { noReply: true } },
  { id: 'pull', source: 'queue', target: 'two' },
  { id: 'toWorker', source: 'queue', target: 'worker' },
]
const nodeIds = new Set(['app', 'one', 'two', 'queue', 'worker'])

function step(kind: Target['kind'], id: string, durationMs = 1000, parallel: Target[] = []): Step {
  return {
    id: `${kind}-${id}`,
    target: { kind, id },
    caption: `${kind} ${id}`,
    durationMs,
    camera: 'follow',
    zoom: 1,
    event: '',
    latencyMs: null,
    level: 'info',
    ...(parallel.length > 0 ? { parallel } : {}),
  }
}

const main = [
  step('node', 'app'),
  { ...step('edge', 'toOne', 1000, [{ kind: 'edge', id: 'toTwo' }]), id: 'fork' },
  { ...step('edge', 'toOne'), id: 'reply' },
  { ...step('node', 'app'), id: 'done' },
]

function side(steps: Step[], fromStep = 'fork'): FlowPath {
  return { id: 'p-side', name: 'Worker', fromStep, steps, rejoinStep: null, concurrent: true }
}

const worker = side([step('edge', 'toQueue', 1500), step('node', 'queue', 1500), step('edge', 'toWorker', 1500)])

function flowWith(paths: FlowPath[], steps: Step[] = main): Flow {
  return { ...createFlow('Fan-out'), steps, paths }
}

const rects = {
  app: { x: 0, y: 0, width: 100, height: 50 },
  one: { x: 300, y: -100, width: 100, height: 50 },
  two: { x: 300, y: 100, width: 100, height: 50 },
  queue: { x: 600, y: 100, width: 100, height: 50 },
  worker: { x: 900, y: 100, width: 100, height: 50 },
}
const tables = {
  toOne: buildArcTable('M100,25 L300,-75'),
  toTwo: buildArcTable('M100,25 L300,125'),
  toQueue: buildArcTable('M400,125 L600,125'),
  pull: buildArcTable('M600,125 L400,125'),
  toWorker: buildArcTable('M700,125 L900,125'),
}
const geometry: FlowGeometry = {
  nodeRect: (id) => rects[id as keyof typeof rects] ?? null,
  edgeTable: (id) => tables[id as keyof typeof tables] ?? null,
  bounds: () => ({ x: 0, y: -100, width: 1000, height: 250 }),
}
const view = { width: 1200, height: 800 }

describe('side paths in the timeline', () => {
  it('plays the side steps one after the other from the end of the fork step', () => {
    const timeline = compileFlow(flowWith([worker]), nodeIds, edges)
    expect(timeline.segments.map((segment) => segment.step.id)).toEqual(['node-app', 'fork', 'reply', 'done'])
    expect(timeline.sides).toHaveLength(1)
    const [track] = timeline.sides
    expect(track!.from.step.id).toBe('fork')
    expect(track!.segments.map((segment) => [segment.startMs, segment.endMs, segment.index, segment.pathId])).toEqual([
      [2000, 3500, 0, 'p-side'],
      [3500, 5000, 1, 'p-side'],
      [5000, 6500, 2, 'p-side'],
    ])
  })

  it('ends with the latest track', () => {
    expect(compileFlow(flowWith([worker]), nodeIds, edges).durationMs).toBe(6500)
    const short = side([step('edge', 'toQueue', 500)])
    expect(compileFlow(flowWith([short]), nodeIds, edges).durationMs).toBe(4000)
  })

  it('takes the direction of the first side edge from the tokens of the fork step', () => {
    const timeline = compileFlow(flowWith([side([step('edge', 'pull')])]), nodeIds, edges)
    expect(timeline.sides[0]!.segments[0]).toMatchObject({ fromNode: 'two', toNode: 'queue', reversed: true })
  })

  it('leaves out a side path whose start step a chosen path replaces', () => {
    const declined: FlowPath = {
      id: 'p-declined',
      name: 'Declined',
      fromStep: 'node-app',
      steps: [step('edge', 'toOne')],
      rejoinStep: null,
    }
    const flow = flowWith([declined, worker])
    expect(compileFlow(flow, nodeIds, edges, 'p-declined').sides).toEqual([])
    expect(compileFlow(flow, nodeIds, edges, null).sides).toHaveLength(1)
  })

  it('keeps side paths out of the steps of a path, and plays the main steps for a side path id', () => {
    const flow = flowWith([worker])
    expect(pathSteps(flow, 'p-side')).toBe(flow.steps)
    const timeline = compileFlow(flow, nodeIds, edges, 'p-side')
    expect(timeline.pathId).toBeNull()
    expect(timeline.sides).toHaveLength(1)
  })

  it('finds a side step with its place in the side view', () => {
    const timeline = compileFlow(flowWith([worker]), nodeIds, edges)
    const place = findSegment(timeline, 'node-queue')!
    expect(place.side?.path.id).toBe('p-side')
    expect(place.index).toBe(2)
    expect(place.view.segments[place.index - 2]!.step.id).toBe('fork')
    expect(findSegment(timeline, 'reply')).toMatchObject({ side: null, index: 2 })
  })

  it('gives the side position at a time: before the start, while it plays, after the end, and at the end', () => {
    const timeline = compileFlow(flowWith([worker]), nodeIds, edges)
    const track = timeline.sides[0]!
    expect([0, 1999, 2000, 3600, 6400, 6500, 9000].map((time) => sideIndexAt(timeline, track, time))).toEqual([
      -1, -1, 0, 1, 2, 2, 2,
    ])
    const short = compileFlow(flowWith([side([step('edge', 'toQueue', 500)])]), nodeIds, edges)
    expect(sideIndexAt(short, short.sides[0]!, 2499)).toBe(0)
    expect(sideIndexAt(short, short.sides[0]!, 2500)).toBe(1)
  })
})

describe('side paths in a frame', () => {
  it('moves the main token and the side token at the same time', () => {
    const timeline = compileFlow(flowWith([worker]), nodeIds, edges)
    const frame = evaluateFlow(timeline, 2900, geometry, view, { camera: false })
    expect(frame.segmentIndex).toBe(2)
    expect(frame.sideIndices).toEqual([0])
    expect(frame.token!.x).toBeLessThan(300)
    expect(frame.parallelTokens).toHaveLength(1)
    expect(frame.parallelTokens[0]).toMatchObject({ lane: 0, side: { track: 0, index: 1 } })
    expect(frame.parallelTokens[0]!.point.x).toBeGreaterThan(400)
    expect([...frame.activeEdges].toSorted()).toEqual(['toOne', 'toQueue'])
  })

  it('shows nothing of a side path before it starts', () => {
    const timeline = compileFlow(flowWith([worker]), nodeIds, edges)
    const frame = evaluateFlow(timeline, 1500, geometry, view, { camera: false })
    expect(frame.sideIndices).toEqual([-1])
    expect(frame.parallelTokens.every((token) => token.side === undefined)).toBe(true)
    expect(frame.activeEdges.has('toQueue')).toBe(false)
    expect(frame.visitedEdges.has('toQueue')).toBe(false)
  })

  it('marks the earlier side steps as visited while the side path plays, and all of them after it ends', () => {
    const timeline = compileFlow(flowWith([worker]), nodeIds, edges)
    const playing = evaluateFlow(timeline, 4000, geometry, view, { camera: false })
    expect(playing.activeNodes.has('queue')).toBe(true)
    expect(playing.visitedEdges.has('toQueue')).toBe(true)

    const short = compileFlow(flowWith([side([step('edge', 'toQueue', 500)])]), nodeIds, edges)
    const ended = evaluateFlow(short, 3500, geometry, view, { camera: false })
    expect(ended.sideIndices).toEqual([1])
    expect(ended.activeEdges.has('toQueue')).toBe(false)
    expect(ended.visitedEdges.has('toQueue')).toBe(true)
    expect(ended.parallelTokens).toEqual([])
  })

  it('keeps the last side token at the end of the flow when the side path ends last', () => {
    const timeline = compileFlow(flowWith([worker]), nodeIds, edges)
    const frame = evaluateFlow(timeline, timeline.durationMs, geometry, view, { camera: false })
    expect(frame.segmentIndex).toBe(3)
    expect(frame.parallelTokens).toHaveLength(1)
    expect(frame.activeEdges.has('toWorker')).toBe(true)
  })

  it('takes the token of a parallel node to the start of the side path at the end of the fork step', () => {
    const steps = [
      step('node', 'app'),
      step('edge', 'toOne', 1000, [{ kind: 'edge', id: 'toTwo' }]),
      { ...step('node', 'one', 1000, [{ kind: 'node', id: 'two' }]), id: 'fork' },
      { ...step('edge', 'toOne'), id: 'reply' },
    ]
    const timeline = compileFlow(flowWith([side([step('edge', 'toQueue')])], steps), nodeIds, edges)
    const end = evaluateFlow(timeline, 2999, geometry, view, { camera: false })
    const token = end.parallelTokens.find((candidate) => candidate.lane === 1)!
    expect(token.point.x).toBeCloseTo(400, 0)
    expect(token.point.y).toBeCloseTo(125, 0)
    const start = evaluateFlow(timeline, 3000, geometry, view, { camera: false })
    expect(start.parallelTokens.find((candidate) => candidate.side)!.point.x).toBeCloseTo(400, 0)
  })

  it('gives the same frame for the same time', () => {
    const timeline = compileFlow(flowWith([worker]), nodeIds, edges)
    const first = evaluateFlow(timeline, 3700, geometry, view, { camera: true })
    evaluateFlow(timeline, 6000, geometry, view, { camera: true })
    evaluateFlow(timeline, 100, geometry, view, { camera: true })
    expect(evaluateFlow(timeline, 3700, geometry, view, { camera: true })).toEqual(first)
  })
})

describe('the camera of side paths', () => {
  it('keeps the timeline of a flow without side steps', () => {
    const plain = compileFlow(flowWith([]), nodeIds, edges)
    expect(cameraTimeline(plain)).toBe(plain)
    const empty = compileFlow(flowWith([side([])]), nodeIds, edges)
    expect(cameraTimeline(empty)).toBe(empty)
  })

  it('cuts the main segments where side steps start and end, and adds the side lanes', () => {
    const timeline = compileFlow(flowWith([worker]), nodeIds, edges)
    const pieces = cameraTimeline(timeline)
    expect(cameraTimeline(timeline)).toBe(pieces)
    expect(
      pieces.segments.map((piece) => [
        piece.startMs,
        piece.endMs,
        piece.index,
        piece.lanes.map((lane) => lane.target.id).join(','),
      ]),
    ).toEqual([
      [0, 1000, 0, 'app'],
      [1000, 2000, 1, 'toOne,toTwo'],
      [2000, 3000, 2, 'toOne,toQueue'],
      [3000, 3500, 3, 'app,toQueue'],
      [3500, 5000, 3, 'app,queue'],
      [5000, 6500, 3, 'app,toWorker'],
    ])
  })

  it('frames the main node and the running side step together', () => {
    const small = { width: 400, height: 300 }
    for (const cameraStyle of ['follow', 'frame'] as const) {
      const styled = (paths: FlowPath[]) => compileFlow({ ...flowWith(paths), cameraStyle }, nodeIds, edges)
      const both = evaluateFlow(styled([worker]), 4500, geometry, small, { camera: true }).camera!
      const alone = evaluateFlow(styled([]), 3900, geometry, small, { camera: true }).camera!
      expect(both.x).toBeGreaterThan(alone.x + 50)
    }
  })
})

describe('edges with no reply', () => {
  it('never sends a token back', () => {
    expect(edgeTravel(edges[1]!, new Set(['two']))).toEqual({ reversed: false, fromNode: 'app', toNode: 'two' })
    expect(edgeTravel(edges[0]!, new Set(['one']))).toMatchObject({ reversed: true, fromNode: 'one' })
  })

  it('takes no token back along them in a route, and keeps the graph search undirected', () => {
    expect(findEdgePath('two', 'app', edges)).toEqual(['toTwo'])
    expect(findEdgePath('two', 'app', edges, { token: true })).toBeNull()
    expect(findEdgePath('app', 'queue', edges, { token: true })).toEqual(['toTwo', 'toQueue'])
  })

  it('does not bring the token of a call with no reply back with the replies', () => {
    expect(joinEdges('one', ['toOne'], new Set(['one', 'two']), edges)).toEqual([])
    const replies = edges.map((edge) => (edge.id === 'toTwo' ? { ...edge, data: {} } : edge))
    expect(joinEdges('one', ['toOne'], new Set(['one', 'two']), replies)).toEqual(['toTwo'])
  })

  it('starts at the token nearest to the node, and the main token wins a tie', () => {
    expect(nearestToken(['one', 'two'], 'queue', edges)).toEqual({ from: 'two', route: ['toQueue'] })
    expect(nearestToken(['one', 'two'], 'app', edges)).toEqual({ from: 'one', route: ['toOne'] })
    const replies = edges.map((edge) => ({ ...edge, data: {} }))
    expect(nearestToken(['one', 'two'], 'app', replies)?.from).toBe('one')
    expect(nearestToken(['one'], 'nowhere', edges)).toBeNull()
  })

  it('does not reverse the side edge after the fork when the main path replies', () => {
    const timeline = compileFlow(flowWith([worker]), nodeIds, edges)
    expect(timeline.segments[2]!.lanes.map((lane) => [lane.fromNode, lane.toNode])).toEqual([['one', 'app']])
  })
})
