import { ReactFlowProvider, useStoreApi } from '@xyflow/react'
import { act, createElement, Fragment, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEdge, defaultCardData, defaultGroupData, defaultTextData } from '@/model/defaults'
import type { Rect } from '@/model/rect'
import type { EdgeData, XY } from '@/model/schema'
import type { DiagramEdge, DiagramNode } from '@/model/types'
import { createRouteStore, EdgeRouter, type RouteStore } from './routing'

// React writes a warning for each act() call if IS_REACT_ACT_ENVIRONMENT is not true.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type FlowStore = ReturnType<typeof useStoreApi<DiagramNode, DiagramEdge>>

function card(id: string, rect: Rect, patch: Partial<DiagramNode> = {}): DiagramNode {
  return {
    id,
    type: 'card',
    position: { x: rect.x, y: rect.y },
    width: rect.width,
    height: rect.height,
    data: defaultCardData(),
    ...patch,
  } as DiagramNode
}

function edge(id: string, source: string, target: string, data: Partial<EdgeData> = {}, handles = {}): DiagramEdge {
  return { ...createEdge(source, target, data, handles), id }
}

function entersRect(route: readonly XY[], rect: Rect) {
  return route.slice(1).some((point, index) => {
    const before = route[index]!
    return (
      Math.max(point.x, before.x) > rect.x &&
      Math.min(point.x, before.x) < rect.x + rect.width &&
      Math.max(point.y, before.y) > rect.y &&
      Math.min(point.y, before.y) < rect.y + rect.height
    )
  })
}

describe('createRouteStore', () => {
  const route = (...points: [number, number][]) => points.map(([x, y]) => ({ x, y }))

  it('keeps the routes and tells its listeners when they change', () => {
    const store = createRouteStore()
    const listener = vi.fn()
    store.subscribe(listener)
    expect(store.get('e1')).toBeUndefined()
    store.replace(new Map([['e1', route([0, 0], [100, 0])]]))
    expect(store.get('e1')).toEqual(route([0, 0], [100, 0]))
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('keeps the array of an unchanged route and tells nobody', () => {
    const store = createRouteStore()
    store.replace(new Map([['e1', route([0, 0], [100, 0])]]))
    const kept = store.get('e1')
    const listener = vi.fn()
    store.subscribe(listener)
    store.replace(new Map([['e1', route([0, 0], [100, 0])]]))
    expect(store.get('e1')).toBe(kept)
    expect(listener).not.toHaveBeenCalled()
  })

  it('replaces the given routes only and drops the given ids without a route', () => {
    const store = createRouteStore()
    store.replace(
      new Map([
        ['e1', route([0, 0], [100, 0])],
        ['e2', route([0, 50], [100, 50])],
        ['e3', route([0, 90], [100, 90])],
      ]),
    )
    const untouched = store.get('e3')
    store.patch(new Set(['e1', 'e2']), new Map([['e1', route([0, 0], [0, 100])]]))
    expect(store.get('e1')).toEqual(route([0, 0], [0, 100]))
    expect(store.get('e2')).toBeUndefined()
    expect(store.get('e3')).toBe(untouched)
  })

  it('tells nobody after an unsubscribe', () => {
    const store = createRouteStore()
    const listener = vi.fn()
    store.subscribe(listener)()
    store.replace(new Map([['e1', route([0, 0], [100, 0])]]))
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('EdgeRouter', () => {
  const a = { x: 0, y: 0, width: 100, height: 50 }
  const b = { x: 400, y: 0, width: 100, height: 50 }
  const blocker = { x: 200, y: -60, width: 100, height: 170 }
  const far = { x: 0, y: 600, width: 100, height: 50 }
  const farther = { x: 400, y: 600, width: 100, height: 50 }

  let container: HTMLElement
  let root: Root
  let flow: FlowStore
  let store: RouteStore
  let frames: FrameRequestCallback[]

  function Grab() {
    const api = useStoreApi<DiagramNode, DiagramEdge>()
    useEffect(() => {
      flow = api
    }, [api])
    return null
  }

  function mount() {
    act(() =>
      root.render(
        createElement(
          ReactFlowProvider,
          null,
          createElement(Fragment, null, createElement(Grab), createElement(EdgeRouter, { store })),
        ),
      ),
    )
  }

  function show(nodes: DiagramNode[], edges: DiagramEdge[]) {
    act(() => {
      flow.getState().setNodes(nodes)
      flow.getState().setEdges(edges)
    })
  }

  function runFrame() {
    act(() => frames.shift()!(performance.now()))
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
    store = createRouteStore()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    mount()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  it('routes smooth and step edges around the nodes in their way', () => {
    show(
      [card('a', a), card('b', b), card('blocker', blocker)],
      [edge('smooth', 'a', 'b'), edge('step', 'b', 'a', { path: 'step' })],
    )
    for (const id of ['smooth', 'step']) {
      const route = store.get(id)!
      expect(route.length).toBeGreaterThan(2)
      expect(entersRect(route, blocker)).toBe(false)
    }
  })

  it('leaves curves, straight lines, hand-drawn routes, loops and edges to text or hidden nodes alone', () => {
    const note = {
      id: 'note',
      type: 'text',
      position: { x: 400, y: 300 },
      width: 160,
      height: 32,
      data: defaultTextData(),
    }
    show(
      [
        card('a', a),
        card('b', b),
        note as DiagramNode,
        card('hidden', far, { hidden: true }),
        card('unmeasured', farther, { width: 0 }),
      ],
      [
        edge('bezier', 'a', 'b', { path: 'bezier' }),
        edge('straight', 'a', 'b', { path: 'straight' }),
        edge('drawn', 'a', 'b', { bends: [{ x: 250, y: 200 }] }),
        edge('loop', 'a', 'a'),
        edge('to-text', 'a', 'note'),
        edge('to-hidden', 'a', 'hidden'),
        edge('to-unmeasured', 'a', 'unmeasured'),
        edge('routed', 'a', 'b'),
      ],
    )
    for (const id of ['bezier', 'straight', 'drawn', 'loop', 'to-text', 'to-hidden', 'to-unmeasured']) {
      expect(store.get(id), id).toBeUndefined()
    }
    expect(store.get('routed')).toBeDefined()
  })

  it('starts and ends a route at the fixed sides of its edge', () => {
    show(
      [card('a', a), card('b', b)],
      [edge('fixed', 'a', 'b', { sides: 'fixed' }, { sourceHandle: 'bottom', targetHandle: 'bottom' })],
    )
    const route = store.get('fixed')!
    expect(route[0]!.y).toBe(a.y + a.height)
    expect(route.at(-1)!.y).toBe(b.y + b.height)
    expect(Math.max(...route.map((point) => point.y))).toBeGreaterThan(a.y + a.height)
  })

  it('routes again when a node moves, and not when the view pans', () => {
    const nodes = [card('a', a), card('b', b)]
    show(nodes, [edge('ab', 'a', 'b')])
    const replace = vi.spyOn(store, 'replace')
    act(() => flow.setState({ transform: [120, 40, 1.5] }))
    expect(replace).not.toHaveBeenCalled()

    show([nodes[0]!, card('b', { ...b, y: 300 })], [edge('ab', 'a', 'b')])
    expect(replace).toHaveBeenCalledTimes(1)
    expect(store.get('ab')!.at(-1)!.y).toBeGreaterThanOrEqual(300)
  })

  it('routes only the edges of the dragged nodes and the edges in their way, once for each frame', () => {
    const edges = [edge('ab', 'a', 'b'), edge('far', 'far', 'farther')]
    show([card('a', a), card('b', b), card('far', far), card('farther', farther)], edges)
    const farRoute = store.get('far')
    const patch = vi.spyOn(store, 'patch')

    show(
      [card('a', a), card('b', { ...b, y: 100 }, { dragging: true }), card('far', far), card('farther', farther)],
      edges,
    )
    show(
      [card('a', a), card('b', { ...b, y: 140 }, { dragging: true }), card('far', far), card('farther', farther)],
      edges,
    )
    expect(patch).not.toHaveBeenCalled()
    expect(frames).toHaveLength(1)

    runFrame()
    expect(patch).toHaveBeenCalledTimes(1)
    expect([...patch.mock.calls[0]![0]]).toEqual(['ab'])
    expect(store.get('far')).toBe(farRoute)
    expect(store.get('ab')!.at(-1)!.y).toBeGreaterThanOrEqual(140)
  })

  it('counts the children of a dragged group as moving', () => {
    const box = {
      id: 'box',
      type: 'group',
      position: { x: 0, y: 300 },
      width: 300,
      height: 200,
      data: defaultGroupData(),
    } as DiagramNode
    const child = card('child', { x: 40, y: 80, width: 100, height: 50 }, { parentId: 'box' })
    const edges = [edge('child-b', 'child', 'b'), edge('ab', 'a', 'b')]
    show([box, child, card('a', a), card('b', b)], edges)
    const patch = vi.spyOn(store, 'patch')
    show([{ ...box, position: { x: 0, y: 360 }, dragging: true }, child, card('a', a), card('b', b)], edges)
    runFrame()
    expect([...patch.mock.calls[0]![0]]).toContain('child-b')
  })

  it('routes all edges again after the drop', () => {
    const edges = [edge('ab', 'a', 'b')]
    show([card('a', a), card('b', b)], edges)
    show([card('a', a), card('b', { ...b, y: 100 }, { dragging: true })], edges)
    const replace = vi.spyOn(store, 'replace')
    show([card('a', a), card('b', { ...b, y: 100 })], edges)
    expect(frames).toHaveLength(0)
    expect(replace).toHaveBeenCalledTimes(1)
  })

  it('stops routing when it unmounts', () => {
    show([card('a', a), card('b', b)], [edge('ab', 'a', 'b')])
    act(() => root.unmount())
    root = createRoot(container)
    const replace = vi.spyOn(store, 'replace')
    flow.getState().setNodes([card('a', a), card('b', { ...b, y: 300 })])
    expect(replace).not.toHaveBeenCalled()
  })
})
