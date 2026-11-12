import { describe, expect, it } from 'vitest'
import { compileFlow, type EdgeEnds } from '@/engine/flow/compile'
import { createFlow } from '@/model/defaults'
import type { Flow, FlowPath, Step, Target } from '@/model/schema'
import { parseTimeMs, startChanges } from './step-start'

const edges: EdgeEnds[] = [
  { id: 'toApi', source: 'web', target: 'api' },
  { id: 'toDb', source: 'api', target: 'db' },
  { id: 'toQueue', source: 'api', target: 'queue', data: { noReply: true } },
]
const nodeIds = new Set(['web', 'api', 'db', 'queue'])

function step(kind: Target['kind'], id: string, durationMs = 1000, extra: Partial<Step> = {}): Step {
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
    ...extra,
  }
}

const main = [step('node', 'web'), step('edge', 'toApi', 1500), step('node', 'api', 2000), step('edge', 'toDb')]

function flowWith(steps: Step[], paths: FlowPath[] = []): Flow {
  return { ...createFlow('Checkout'), steps, paths }
}

function timeline(flow: Flow, pathId: string | null = null) {
  return compileFlow(flow, nodeIds, edges, pathId)
}

describe('parseTimeMs', () => {
  it('reads seconds, with or without the sign and the unit of the log', () => {
    expect(parseTimeMs('4')).toBe(4000)
    expect(parseTimeMs('4.1')).toBe(4100)
    expect(parseTimeMs('+4.100s')).toBe(4100)
    expect(parseTimeMs(' + 2.5 S ')).toBe(2500)
    expect(parseTimeMs('.25')).toBe(250)
    expect(parseTimeMs('3.')).toBe(3000)
  })

  it('reads a comma as the decimal mark', () => {
    expect(parseTimeMs('1,75')).toBe(1750)
  })

  it('reads milliseconds and rounds to whole milliseconds', () => {
    expect(parseTimeMs('4100ms')).toBe(4100)
    expect(parseTimeMs('12.6 ms')).toBe(13)
    expect(parseTimeMs('1.0004')).toBe(1000)
  })

  it('refuses text that is not a time of zero or more', () => {
    for (const text of ['', 's', '-1', '1.2.3', 'abc', '1 min', '++1', '1e3']) expect(parseTimeMs(text)).toBeNull()
  })
})

describe('startChanges', () => {
  it('changes the duration of the step before, so the later steps move with the step', () => {
    const played = timeline(flowWith(main))
    expect(played.segments.map((segment) => segment.startMs)).toEqual([0, 1000, 2500, 4500])
    expect(startChanges(played, 'node-api', 3000)).toEqual([{ stepId: 'edge-toApi', durationMs: 2000 }])
    expect(startChanges(played, 'node-api', 1200)).toEqual([{ stepId: 'edge-toApi', durationMs: 200 }])
  })

  it('also changes the step itself with keepLater, so the next step keeps its start', () => {
    const played = timeline(flowWith(main))
    expect(startChanges(played, 'node-api', 3000, true)).toEqual([
      { stepId: 'edge-toApi', durationMs: 2000 },
      { stepId: 'node-api', durationMs: 1500 },
    ])
  })

  it('keeps every duration in the limits of the schema', () => {
    const played = timeline(flowWith(main))
    expect(startChanges(played, 'node-api', 0)).toEqual([{ stepId: 'edge-toApi', durationMs: 100 }])
    expect(startChanges(played, 'node-api', 100_000)).toEqual([{ stepId: 'edge-toApi', durationMs: 60_000 }])
    expect(startChanges(played, 'node-api', 6000, true)).toEqual([
      { stepId: 'edge-toApi', durationMs: 3400 },
      { stepId: 'node-api', durationMs: 100 },
    ])
  })

  it('counts the lane delays of the step before', () => {
    const delayed = [step('node', 'web'), step('edge', 'toApi', 1000, { delayMs: 500 }), step('node', 'api')]
    const played = timeline(flowWith(delayed))
    expect(played.segments[2]!.startMs).toBe(2500)
    expect(startChanges(played, 'node-api', 3000)).toEqual([{ stepId: 'edge-toApi', durationMs: 1500 }])
  })

  it('changes nothing for the first step, a missing step or the same start', () => {
    const played = timeline(flowWith(main))
    expect(startChanges(played, 'node-web', 500)).toEqual([])
    expect(startChanges(played, 'missing', 500)).toEqual([])
    expect(startChanges(played, 'node-api', 2500)).toEqual([])
  })

  it('skips a step whose target does not exist', () => {
    const played = timeline(flowWith([step('node', 'web'), step('node', 'gone'), step('edge', 'toApi')]))
    expect(startChanges(played, 'edge-toApi', 1500)).toEqual([{ stepId: 'node-web', durationMs: 1500 }])
  })

  it('changes the main step where a path starts, for the first step of the path', () => {
    const declined: FlowPath = {
      id: 'p-declined',
      name: 'Declined',
      fromStep: 'edge-toApi',
      steps: [step('edge', 'toQueue', 800)],
      rejoinStep: null,
    }
    const played = timeline(flowWith(main, [declined]), 'p-declined')
    expect(startChanges(played, 'edge-toQueue', 3000)).toEqual([{ stepId: 'edge-toApi', durationMs: 2000 }])
  })

  it('changes the step before on a side path, and the main step where the side path starts', () => {
    const audit: FlowPath = {
      id: 'p-audit',
      name: 'Audit',
      fromStep: 'edge-toApi',
      steps: [step('edge', 'toQueue', 800), step('node', 'queue', 600)],
      rejoinStep: null,
      concurrent: true,
    }
    const played = timeline(flowWith(main, [audit]))
    expect(played.sides[0]!.segments.map((segment) => segment.startMs)).toEqual([2500, 3300])
    expect(startChanges(played, 'node-queue', 4000)).toEqual([{ stepId: 'edge-toQueue', durationMs: 1500 }])
    expect(startChanges(played, 'edge-toQueue', 2000)).toEqual([{ stepId: 'edge-toApi', durationMs: 1000 }])
  })
})
