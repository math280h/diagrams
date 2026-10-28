import { describe, expect, it } from 'vitest'
import { createFlow } from '@/model/defaults'
import { lanesText, pathSteps, removeStep } from '@/model/flow'
import type { Flow, FlowPath, Step, Target } from '@/model/schema'
import { buildArcTable } from '@/engine/path-sampler'
import { compileFlow } from './compile'
import { evaluateFlow, type FlowGeometry } from './evaluate'

const edges = [
  { id: 'ab', source: 'a', target: 'b' },
  { id: 'ac', source: 'a', target: 'c' },
  { id: 'bd', source: 'b', target: 'd' },
  { id: 'bc', source: 'b', target: 'c' },
]
const nodeIds = new Set(['a', 'b', 'c', 'd'])

function step(kind: Target['kind'], id: string, parallel: Target[] = [], durationMs = 1000): Step {
  return {
    id: `${kind}-${id}`,
    target: { kind, id },
    caption: '',
    durationMs,
    camera: 'follow',
    zoom: 1,
    event: '',
    latencyMs: null,
    level: 'info',
    ...(parallel.length > 0 ? { parallel } : {}),
  }
}

function flowWith(steps: Step[], paths: FlowPath[] = []): Flow {
  return { ...createFlow('Test'), steps, ...(paths.length > 0 ? { paths } : {}) }
}

const fanOut = [
  step('node', 'a'),
  step('edge', 'ab', [{ kind: 'edge', id: 'ac' }]),
  step('node', 'b', [{ kind: 'node', id: 'c' }], 4000),
]

describe('parallel targets', () => {
  it('gives each target of a step its own lane in travel order', () => {
    const timeline = compileFlow(flowWith(fanOut), nodeIds, edges)
    expect(timeline.segments[1]!.lanes).toEqual([
      { target: { kind: 'edge', id: 'ab' }, reversed: false, fromNode: 'a', toNode: 'b' },
      { target: { kind: 'edge', id: 'ac' }, reversed: false, fromNode: 'a', toNode: 'c' },
    ])
    expect(timeline.segments[2]!.lanes.map((lane) => lane.toNode)).toEqual(['b', 'c'])
  })

  it('drops a parallel target that does not exist, and keeps the step', () => {
    const timeline = compileFlow(flowWith([step('edge', 'ab', [{ kind: 'edge', id: 'gone' }])]), nodeIds, edges)
    expect(timeline.segments).toHaveLength(1)
    expect(timeline.segments[0]!.lanes).toHaveLength(1)
  })

  it('reverses an edge when one of the tokens rests on its target', () => {
    const timeline = compileFlow(
      flowWith([step('node', 'd', [{ kind: 'node', id: 'c' }]), step('edge', 'bd', [{ kind: 'edge', id: 'bc' }])]),
      nodeIds,
      edges,
    )
    expect(timeline.segments[1]!.lanes.map((lane) => [lane.fromNode, lane.toNode])).toEqual([
      ['d', 'b'],
      ['c', 'b'],
    ])
  })

  const rects = {
    a: { x: 0, y: 0, width: 100, height: 50 },
    b: { x: 300, y: -100, width: 100, height: 50 },
    c: { x: 300, y: 100, width: 100, height: 50 },
    d: { x: 600, y: -100, width: 100, height: 50 },
  }
  const tables = {
    ab: buildArcTable('M100,25 L300,-75'),
    ac: buildArcTable('M100,25 L300,125'),
  }
  const geometry: FlowGeometry = {
    nodeRect: (id) => rects[id as keyof typeof rects] ?? null,
    edgeTable: (id) => tables[id as keyof typeof tables] ?? null,
    bounds: () => ({ x: 0, y: -100, width: 700, height: 250 }),
  }
  const view = { width: 1200, height: 800 }

  it('moves one token along each edge of the step', () => {
    const timeline = compileFlow(flowWith(fanOut), nodeIds, edges)
    const frame = evaluateFlow(timeline, 1500, geometry, view, { camera: false })
    expect(frame.token!.y).toBeLessThan(25)
    expect(frame.parallelTokens).toHaveLength(1)
    expect(frame.parallelTokens[0]!.lane).toBe(1)
    expect(frame.parallelTokens[0]!.point.y).toBeGreaterThan(25)
    expect([...frame.activeEdges].toSorted()).toEqual(['ab', 'ac'])
  })

  it('marks every node of a parallel node step as active', () => {
    const timeline = compileFlow(flowWith(fanOut), nodeIds, edges)
    const frame = evaluateFlow(timeline, 3000, geometry, view, { camera: false })
    expect([...frame.activeNodes].toSorted()).toEqual(['b', 'c'])
    expect([...frame.visitedEdges].toSorted()).toEqual(['ab', 'ac'])
  })

  it('frames all targets of a parallel step instead of following one token', () => {
    const timeline = compileFlow(flowWith(fanOut), nodeIds, edges)
    const frame = evaluateFlow(timeline, 4000, geometry, view, { camera: true })
    expect(frame.camera!.x).toBeCloseTo(350, 0)
    expect(frame.camera!.y).toBeCloseTo(25, 0)
  })
})

describe('paths', () => {
  const main = [step('node', 'a'), step('edge', 'ab'), step('node', 'b'), step('edge', 'bd'), step('node', 'd')]
  const failed: FlowPath = {
    id: 'p-failed',
    name: 'Failed',
    fromStep: 'node-b',
    steps: [step('edge', 'bc'), step('node', 'c')],
    rejoinStep: null,
  }

  it('plays the main steps up to the start of the path, then the path', () => {
    const flow = flowWith(main, [failed])
    expect(pathSteps(flow, 'p-failed').map((candidate) => candidate.id)).toEqual([
      'node-a',
      'edge-ab',
      'node-b',
      'edge-bc',
      'node-c',
    ])
    const timeline = compileFlow(flow, nodeIds, edges, 'p-failed')
    expect(timeline.pathId).toBe('p-failed')
    expect(timeline.segments.map((segment) => segment.pathId)).toEqual([null, null, null, 'p-failed', 'p-failed'])
  })

  it('continues with the main steps from the rejoin step', () => {
    const flow = flowWith(main, [{ ...failed, rejoinStep: 'node-d' }])
    expect(pathSteps(flow, 'p-failed').map((candidate) => candidate.id)).toEqual([
      'node-a',
      'edge-ab',
      'node-b',
      'edge-bc',
      'node-c',
      'node-d',
    ])
  })

  it('plays the main steps without a path, or for a path that starts at no main step', () => {
    const flow = flowWith(main, [{ ...failed, fromStep: 'gone' }])
    expect(pathSteps(flow, null)).toBe(flow.steps)
    expect(pathSteps(flow, 'p-failed')).toBe(flow.steps)
    expect(compileFlow(flow, nodeIds, edges, 'nothing').pathId).toBeNull()
  })

  it('moves the start and the rejoin of a path when their main step goes', () => {
    const flow = flowWith(structuredClone(main), [{ ...structuredClone(failed), rejoinStep: 'edge-bd' }])
    removeStep(flow, 'node-b')
    expect(flow.paths![0]).toMatchObject({ fromStep: 'edge-ab', rejoinStep: 'edge-bd' })
    removeStep(flow, 'edge-bd')
    expect(flow.paths![0]!.rejoinStep).toBe('node-d')
    removeStep(flow, 'node-a')
    removeStep(flow, 'edge-ab')
    expect(flow.paths).toEqual([])
  })

  it('removes a path step from its path', () => {
    const flow = flowWith(structuredClone(main), [structuredClone(failed)])
    removeStep(flow, 'edge-bc')
    expect(flow.paths![0]!.steps.map((candidate) => candidate.id)).toEqual(['node-c'])
    expect(flow.steps).toHaveLength(5)
  })
})

describe('lanesText', () => {
  it('names the shared source of a fan-out once', () => {
    expect(
      lanesText([
        { kind: 'edge', from: 'Kafka', to: 'Enricher' },
        { kind: 'edge', from: 'Kafka', to: 'Fraud scoring' },
      ]),
    ).toBe('Kafka → Enricher, Fraud scoring')
    expect(
      lanesText([
        { kind: 'node', from: 'Enricher', to: '' },
        { kind: 'node', from: 'Fraud scoring', to: '' },
      ]),
    ).toBe('Enricher, Fraud scoring')
    expect(lanesText([{ kind: 'edge', from: 'Web', to: 'Collector' }])).toBe('Web → Collector')
  })
})
