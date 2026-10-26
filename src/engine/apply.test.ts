import { describe, expect, it } from 'vitest'
import { flowStateKey } from './apply'
import type { ElementKey, FlowFrame } from './flow/evaluate'

function frame(segmentIndex: number, emphasis: [ElementKey, number][] = []): FlowFrame {
  return {
    segmentIndex,
    token: { x: segmentIndex * 10, y: 0 },
    tokenLift: 0,
    tokenLabel: 1,
    activeNodes: new Set(),
    activeEdges: new Set(),
    visitedNodes: new Set(),
    visitedEdges: new Set(),
    caption: '',
    camera: null,
    emphasis: new Map(emphasis),
    trafficScale: new Map(),
  }
}

describe('flowStateKey', () => {
  it('stays the same while the token moves within one step', () => {
    const a = frame(2)
    const b = { ...frame(2), token: { x: 400, y: 80 }, tokenLabel: 0.4 }
    expect(flowStateKey(a, true)).toBe(flowStateKey(b, true))
  })

  it('changes with the step, the spotlight and the emphasis values', () => {
    const base = flowStateKey(frame(2), true)
    expect(flowStateKey(frame(3), true)).not.toBe(base)
    expect(flowStateKey(frame(2), false)).not.toBe(base)
    expect(flowStateKey(frame(2, [['node:a', 0.5]]), true)).not.toBe(base)
    expect(flowStateKey(frame(2, [['node:a', 0.5]]), true)).not.toBe(flowStateKey(frame(2, [['node:a', 0.6]]), true))
  })
})
