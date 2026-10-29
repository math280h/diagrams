import { describe, expect, it } from 'vitest'
import { createFlow } from '@/model/defaults'
import type { Flow, Step } from '@/model/schema'
import { cameraToViewport, viewportToCamera } from '@/engine/camera'
import { buildArcTable } from '@/engine/path-sampler'
import { findEdgePath } from '@/engine/route'
import { compileFlow, segmentIndexAt } from './compile'
import { evaluateFlow, perimeterPath, type FlowGeometry } from './evaluate'
import { stepFrames } from './framing'
import { sampleValueTrack } from './tracks'

const edges = [
  { id: 'ab', source: 'a', target: 'b' },
  { id: 'bc', source: 'b', target: 'c' },
]

function step(kind: 'node' | 'edge', id: string, durationMs = 1000): Step {
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
  }
}

function flowWith(steps: Step[], patch: Partial<Flow> = {}): Flow {
  return { ...createFlow('Test'), steps, ...patch }
}

const rects = {
  a: { x: 0, y: 0, width: 100, height: 50 },
  b: { x: 300, y: 0, width: 100, height: 50 },
  c: { x: 600, y: 0, width: 100, height: 50 },
}
const tables = {
  ab: buildArcTable('M100,25 L300,25'),
  bc: buildArcTable('M400,25 L600,25'),
}
const geometry: FlowGeometry = {
  nodeRect: (id) => rects[id as keyof typeof rects] ?? null,
  edgeTable: (id) => tables[id as keyof typeof tables] ?? null,
  bounds: () => ({ x: 0, y: 0, width: 700, height: 50 }),
}
const view = { width: 1200, height: 800 }
const nodeIds = new Set(['a', 'b', 'c'])

describe('compileFlow', () => {
  it('places the steps one after the other', () => {
    const timeline = compileFlow(
      flowWith([step('node', 'a', 500), step('edge', 'ab', 800), step('node', 'b', 300)]),
      nodeIds,
      edges,
    )
    expect(timeline.segments.map((segment) => [segment.startMs, segment.endMs])).toEqual([
      [0, 500],
      [500, 1300],
      [1300, 1600],
    ])
    expect(timeline.durationMs).toBe(1600)
  })

  it('reverses an edge step when the token comes from the edge target', () => {
    const timeline = compileFlow(flowWith([step('node', 'b'), step('edge', 'ab')]), nodeIds, edges)
    expect(timeline.segments[1]).toMatchObject({ reversed: true, fromNode: 'b', toNode: 'a' })
  })

  it('drops steps whose target does not exist', () => {
    const timeline = compileFlow(
      flowWith([step('node', 'missing'), step('edge', 'nope'), step('node', 'a')]),
      nodeIds,
      edges,
    )
    expect(timeline.segments).toHaveLength(1)
  })

  it('extends the duration to the last keyframe', () => {
    const flow = flowWith([step('node', 'a', 500)], {
      tracks: [
        {
          id: 't',
          kind: 'emphasis',
          target: { kind: 'node', id: 'a' },
          keyframes: [{ id: 'k', atMs: 4000, ease: 'linear', value: 1 }],
        },
      ],
    })
    expect(compileFlow(flow, nodeIds, edges).durationMs).toBe(4000)
  })
})

describe('segmentIndexAt', () => {
  it('finds the segment for a time', () => {
    const timeline = compileFlow(flowWith([step('node', 'a'), step('edge', 'ab'), step('node', 'b')]), nodeIds, edges)
    expect(segmentIndexAt(timeline, 0)).toBe(0)
    expect(segmentIndexAt(timeline, 1500)).toBe(1)
    expect(segmentIndexAt(timeline, 99_999)).toBe(2)
  })
})

describe('evaluateFlow', () => {
  const timeline = compileFlow(
    flowWith([step('node', 'a'), step('edge', 'ab'), step('node', 'b'), step('edge', 'bc'), step('node', 'c')]),
    nodeIds,
    edges,
  )

  it('puts the token on the edge during an edge step', () => {
    const frame = evaluateFlow(timeline, 1500, geometry, view, { camera: false })
    expect(frame.token?.y).toBeCloseTo(25, 5)
    expect(frame.token!.x).toBeGreaterThan(100)
    expect(frame.token!.x).toBeLessThan(300)
    expect(frame.activeEdges.has('ab')).toBe(true)
    expect(frame.visitedNodes.has('a')).toBe(true)
  })

  it('marks reached nodes as visited and the current node as active', () => {
    const frame = evaluateFlow(timeline, 4500, geometry, view, { camera: false })
    expect([...frame.activeNodes]).toEqual(['c'])
    expect(frame.visitedNodes.has('a') && frame.visitedNodes.has('b')).toBe(true)
    expect(frame.caption).toBe('node c')
  })

  it('gives the same frame for the same time', () => {
    const first = evaluateFlow(timeline, 2345, geometry, view, { camera: true })
    const second = evaluateFlow(timeline, 2345, geometry, view, { camera: true })
    expect(second.token).toEqual(first.token)
    expect(second.camera).toEqual(first.camera)
  })

  it('frames the step when the whole diagram is too small to read', () => {
    const narrow = { width: 200, height: 150 }
    const frame = evaluateFlow(timeline, 4900, geometry, narrow, { camera: true })
    expect(frame.camera!.x).toBeGreaterThan(450)
  })

  it('keeps a diagram that fits the view in the middle', () => {
    const frame = evaluateFlow(timeline, 4900, geometry, view, { camera: true })
    expect(frame.camera!.x).toBeCloseTo(350, 0)
  })

  it('moves the camera without jumps at step changes', () => {
    const fitted = compileFlow(
      flowWith([
        { ...step('node', 'a', 1000), camera: 'fit', zoom: 2 },
        { ...step('edge', 'ab', 800), zoom: 0.4 },
        { ...step('node', 'c', 1000), camera: 'fit', zoom: 2 },
      ]),
      nodeIds,
      edges,
    )
    let previous = evaluateFlow(fitted, 0, geometry, view, { camera: true }).camera!
    for (let time = 16; time <= 2800; time += 16) {
      const camera = evaluateFlow(fitted, time, geometry, view, { camera: true }).camera!
      expect(Math.hypot(camera.x - previous.x, camera.y - previous.y)).toBeLessThan(40)
      expect(Math.abs(Math.log(camera.zoom / previous.zoom))).toBeLessThan(0.08)
      previous = camera
    }
  })

  it('cuts to each step with reduced motion', () => {
    const camera = evaluateFlow(timeline, 2500, geometry, view, { camera: true, reducedMotion: true }).camera!
    expect(camera.x).toBe(350)
    expect(camera.y).toBe(25)
  })
})

describe('token bridge', () => {
  const bridgeRects = { ...rects, d: { x: 300, y: 200, width: 100, height: 50 } }
  const bridgeTables = { ...tables, bd: buildArcTable('M350,50 L350,200') }
  const bridgeGeometry: FlowGeometry = {
    nodeRect: (id) => bridgeRects[id as keyof typeof bridgeRects] ?? null,
    edgeTable: (id) => bridgeTables[id as keyof typeof bridgeTables] ?? null,
    bounds: () => ({ x: 0, y: 0, width: 700, height: 250 }),
  }
  const bridgeEdges = [...edges, { id: 'bd', source: 'b', target: 'd' }]

  it('walks the shorter way around a node outline', () => {
    expect(perimeterPath(rects.b, { x: 300, y: 25 }, { x: 350, y: 50 })).toEqual([
      { x: 300, y: 25 },
      { x: 300, y: 25 },
      { x: 300, y: 50 },
      { x: 350, y: 50 },
      { x: 350, y: 50 },
    ])
  })

  it('moves the token around the node between two edges instead of a jump', () => {
    const chained = compileFlow(
      flowWith([step('edge', 'ab'), step('edge', 'bd')]),
      new Set(['a', 'b', 'd']),
      bridgeEdges,
    )
    const before = evaluateFlow(chained, 999, bridgeGeometry, view, { camera: false }).token!
    const after = evaluateFlow(chained, 1001, bridgeGeometry, view, { camera: false }).token!
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(2)
    const middle = evaluateFlow(chained, 1500, bridgeGeometry, view, { camera: false })
    expect(middle.tokenLabel).toBeLessThan(1)
  })
})

describe('tracks', () => {
  it('interpolates values and holds them outside the keyframes', () => {
    const keyframes = [
      { id: '1', atMs: 1000, ease: 'linear' as const, value: 0 },
      { id: '2', atMs: 2000, ease: 'linear' as const, value: 1 },
    ]
    expect(sampleValueTrack(keyframes, 0)).toBe(0)
    expect(sampleValueTrack(keyframes, 1500)).toBeCloseTo(0.5, 5)
    expect(sampleValueTrack(keyframes, 3000)).toBe(1)
    expect(sampleValueTrack([], 1000)).toBeNull()
  })
})

describe('camera', () => {
  it('converts between camera and viewport', () => {
    const camera = { x: 120, y: -40, zoom: 1.5 }
    expect(viewportToCamera(cameraToViewport(camera, view), view)).toEqual(camera)
  })
})

describe('findEdgePath', () => {
  it('finds a chain of edges in any direction', () => {
    expect(findEdgePath('a', 'c', edges)).toEqual(['ab', 'bc'])
    expect(findEdgePath('c', 'a', edges)).toEqual(['bc', 'ab'])
    expect(findEdgePath('a', 'a', edges)).toEqual([])
    expect(findEdgePath('a', 'z', edges)).toBeNull()
  })
})

describe('step frames', () => {
  const row = ['a', 'b', 'c', 'd', 'e']
  const rowRects = Object.fromEntries(row.map((id, index) => [id, { x: index * 300, y: 0, width: 100, height: 50 }]))
  const rowEdges = row.slice(1).map((id, index) => ({ id: `${row[index]}${id}`, source: row[index]!, target: id }))
  const rowGeometry = (texts: { x: number; y: number; width: number; height: number }[] = []): FlowGeometry => ({
    nodeRect: (id) => rowRects[id] ?? null,
    edgeTable: (id) => {
      const index = rowEdges.findIndex((edge) => edge.id === id)
      return index < 0 ? null : buildArcTable(`M${index * 300 + 100},25 L${index * 300 + 300},25`)
    },
    bounds: () => unionOf([...Object.values(rowRects), ...texts]),
    texts: () => texts,
  })
  const unionOf = (parts: { x: number; y: number; width: number; height: number }[]) => {
    const x = Math.min(...parts.map((rect) => rect.x))
    const y = Math.min(...parts.map((rect) => rect.y))
    return {
      x,
      y,
      width: Math.max(...parts.map((rect) => rect.x + rect.width)) - x,
      height: Math.max(...parts.map((rect) => rect.y + rect.height)) - y,
    }
  }
  const walk = row.flatMap((id, index) =>
    index === 0 ? [step('node', id)] : [step('edge', `${row[index - 1]}${id}`), step('node', id)],
  )
  const timeline = compileFlow(flowWith(walk), new Set(row), rowEdges)
  const middle = (index: number) => (timeline.segments[index]!.startMs + timeline.segments[index]!.endMs) / 2
  const medium = { width: 800, height: 400 }

  it('holds the whole diagram while it is legible', () => {
    const frames = stepFrames(timeline, rowGeometry(), { width: 1600, height: 900 })
    expect(new Set(frames.map((frame) => JSON.stringify(frame))).size).toBe(1)
  })

  it('moves only when a step leaves the safe area, and then takes in the steps that come next', () => {
    const frames = stepFrames(timeline, rowGeometry(), medium)
    expect(frames[0]).toEqual(frames[4])
    expect(frames[5]).not.toEqual(frames[4])
    expect(new Set(frames.map((frame) => frame.zoom)).size).toBe(1)
  })

  it('zooms out for an edge that does not fit, and keeps that zoom while it stays legible', () => {
    const wide = compileFlow(flowWith([step('node', 'a'), step('edge', 'ac'), step('node', 'c')]), new Set(row), [
      { id: 'ac', source: 'a', target: 'c' },
    ])
    const frames = stepFrames(wide, rowGeometry(), { width: 600, height: 300 })
    expect(frames[1]!.zoom).toBeLessThan(frames[0]!.zoom)
    expect(frames[2]!.zoom).toBe(frames[1]!.zoom)
  })

  it('frames the node that the token goes to when the two ends of an edge are too far apart to read', () => {
    const long = compileFlow(flowWith([step('node', 'a'), step('edge', 'ae')]), new Set(row), [
      { id: 'ae', source: 'a', target: 'e' },
    ])
    const frames = stepFrames(long, rowGeometry(), { width: 400, height: 300 })
    expect(frames[1]!.zoom).toBe(frames[0]!.zoom)
    expect(frames[1]!.x).toBeGreaterThan(1000)
  })

  it('shows a text whole or not at all', () => {
    const title = { x: 200, y: -120, width: 500, height: 40 }
    const frames = stepFrames(timeline, rowGeometry([title]), medium)
    for (const frame of frames) {
      const left = frame.x - medium.width / 2 / frame.zoom
      const right = frame.x + medium.width / 2 / frame.zoom
      const top = frame.y - medium.height / 2 / frame.zoom
      const inside = title.x >= left && title.x + title.width <= right && title.y >= top
      const outside = title.x + title.width <= left || title.x >= right || title.y + title.height <= top
      expect(inside || outside).toBe(true)
    }
  })

  it('reaches the frame sooner with the quick motion than with the slow one', () => {
    const shape = rowGeometry()
    const at = timeline.segments[5]!.startMs + 300
    const target = stepFrames(timeline, shape, medium)[5]!
    const quick = evaluateFlow(
      compileFlow(flowWith(walk, { cameraMotion: 'quick' }), new Set(row), rowEdges),
      at,
      shape,
      medium,
      { camera: true },
    ).camera!
    const slow = evaluateFlow(
      compileFlow(flowWith(walk, { cameraMotion: 'slow' }), new Set(row), rowEdges),
      at,
      shape,
      medium,
      { camera: true },
    ).camera!
    expect(Math.abs(quick.x - target.x)).toBeLessThan(Math.abs(slow.x - target.x))
  })

  it('tracks the token with the follow camera', () => {
    const follow = compileFlow(flowWith(walk, { cameraStyle: 'follow' }), new Set(row), rowEdges)
    const shape = rowGeometry()
    const edge = follow.segments[5]!
    const early = evaluateFlow(follow, edge.startMs + 300, shape, medium, { camera: true }).camera!
    const late = evaluateFlow(follow, edge.endMs - 100, shape, medium, { camera: true }).camera!
    expect(late.x).toBeGreaterThan(early.x)
  })

  it('shows the whole diagram and does not move with the still camera', () => {
    const still = compileFlow(flowWith(walk, { cameraStyle: 'still' }), new Set(row), rowEdges)
    const shape = rowGeometry()
    const cameras = [0, middle(3), middle(8)].map(
      (timeMs) => evaluateFlow(still, timeMs, shape, medium, { camera: true }).camera,
    )
    expect(cameras[1]).toEqual(cameras[0])
    expect(cameras[2]).toEqual(cameras[0])
  })

  it('cuts with reduced motion, and dips the canvas only where the frame changes', () => {
    const shape = rowGeometry()
    const frames = stepFrames(timeline, shape, medium)
    const at = (timeMs: number) => evaluateFlow(timeline, timeMs, shape, medium, { camera: true, reducedMotion: true })
    expect(at(middle(5)).camera).toEqual(frames[5])
    expect(at(timeline.segments[5]!.startMs).viewOpacity).toBeLessThan(0.5)
    expect(at(timeline.segments[3]!.startMs).viewOpacity).toBe(1)
    expect(at(middle(5)).viewOpacity).toBe(1)
  })
})
