import { describe, expect, it } from 'vitest'
import { rectsOverlap, type Rect } from '@/model/rect'
import { placeCallout, type CalloutObstacles, type CalloutPlacement, type CalloutRequest } from './callout'
import { buildArcTable } from './path-sampler'

const BOUNDS: Rect = { x: 0, y: 0, width: 1000, height: 600 }
const NODE: Rect = { x: 400, y: 260, width: 160, height: 60 }
const SIZE = { width: 220, height: 64 }
const NONE: CalloutObstacles = { rects: [], paths: [] }

function request(overrides: Partial<CalloutRequest> = {}): CalloutRequest {
  return {
    anchor: { kind: 'rect', rect: NODE, topClear: 0 },
    viewport: { x: 0, y: 0, zoom: 1 },
    ...SIZE,
    bounds: BOUNDS,
    tiers: [{ rects: [NODE], paths: [] }],
    lineClearPx: 12,
    ...overrides,
  }
}

function cardOf(placement: CalloutPlacement | null): Rect {
  expect(placement).not.toBeNull()
  return { x: placement!.x, y: placement!.y, ...SIZE }
}

function inside(card: Rect, bounds: Rect) {
  return (
    card.x >= bounds.x &&
    card.y >= bounds.y &&
    card.x + card.width <= bounds.x + bounds.width &&
    card.y + card.height <= bounds.y + bounds.height
  )
}

describe('placeCallout', () => {
  it('puts the card on the right of a node, clear of the node, with the tail on the node', () => {
    const placement = placeCallout(request())
    const card = cardOf(placement)
    expect(placement!.side).toBe('right')
    expect(rectsOverlap(card, NODE)).toBe(false)
    expect(card.x).toBeGreaterThan(NODE.x + NODE.width)
    const tailY = card.y + placement!.tailPx
    expect(tailY).toBeGreaterThan(NODE.y)
    expect(tailY).toBeLessThan(NODE.y + NODE.height)
  })

  it('flips to the left when the right side has no room in the bounds', () => {
    const node = { ...NODE, x: 760 }
    const placement = placeCallout(
      request({ anchor: { kind: 'rect', rect: node, topClear: 0 }, tiers: [{ rects: [node], paths: [] }] }),
    )
    const card = cardOf(placement)
    expect(placement!.side).toBe('left')
    expect(inside(card, BOUNDS)).toBe(true)
    expect(rectsOverlap(card, node)).toBe(false)
  })

  it('flips to another side when an obstacle takes the free side, and ignores a low tier only when it must', () => {
    const neighbour = { x: 580, y: 200, width: 200, height: 200 }
    const placement = placeCallout(
      request({
        tiers: [
          { rects: [NODE], paths: [] },
          { rects: [neighbour], paths: [] },
        ],
      }),
    )
    const card = cardOf(placement)
    expect(placement!.side).toBe('left')
    expect(rectsOverlap(card, neighbour)).toBe(false)

    const walls = [neighbour, { x: 0, y: 0, width: 390, height: 600 }, { x: 0, y: 0, width: 1000, height: 250 }]
    const crowded = placeCallout(
      request({
        tiers: [
          { rects: [NODE], paths: [] },
          { rects: walls, paths: [] },
        ],
        bounds: { ...BOUNDS, height: 400 },
      }),
    )
    expect(rectsOverlap(cardOf(crowded), NODE)).toBe(false)
  })

  it('keeps the space above a node free for the token label', () => {
    const sides = [
      { x: 0, y: 230, width: 395, height: 170 },
      { x: 565, y: 230, width: 435, height: 170 },
      { x: 0, y: 325, width: 1000, height: 275 },
    ]
    const placement = placeCallout(
      request({ anchor: { kind: 'rect', rect: NODE, topClear: 32 }, tiers: [{ rects: [NODE, ...sides], paths: [] }] }),
    )
    expect(placement!.side).toBe('top')
    expect(placement!.y + SIZE.height).toBeLessThanOrEqual(NODE.y - 32 - 10)
  })

  it('puts the card across a horizontal edge, clear of the line and its label', () => {
    const path = buildArcTable('M100,300 L900,300')
    const placement = placeCallout(request({ anchor: { kind: 'path', path }, tiers: [{ rects: [], paths: [path] }] }))
    const card = cardOf(placement)
    expect(placement!.side).toBe('top')
    expect(card.y + card.height).toBeLessThanOrEqual(300 - 12)
    expect(card.x + placement!.tailPx).toBeCloseTo(500, -1)
    expect(placement!.reachPx).toBeGreaterThan(10)
  })

  it('puts the card beside a vertical edge', () => {
    const path = buildArcTable('M500,40 L500,560')
    const placement = placeCallout(request({ anchor: { kind: 'path', path }, tiers: [{ rects: [], paths: [path] }] }))
    const card = cardOf(placement)
    expect(placement!.side).toBe('right')
    expect(card.x).toBeGreaterThanOrEqual(500 + 12)
  })

  it('points at the visible part of an edge that leaves the view', () => {
    const path = buildArcTable('M600,300 L3000,300')
    const placement = placeCallout(request({ anchor: { kind: 'path', path }, tiers: [{ rects: [], paths: [path] }] }))
    const card = cardOf(placement)
    expect(inside(card, BOUNDS)).toBe(true)
    expect(card.x + placement!.tailPx).toBeGreaterThan(600)
    expect(card.x + placement!.tailPx).toBeLessThan(1000)
  })

  it('moves farther from the anchor when the near places are taken', () => {
    const blockers = [
      { x: 0, y: 200, width: 390, height: 200 },
      { x: 570, y: 200, width: 430, height: 200 },
      { x: 0, y: 330, width: 1000, height: 270 },
    ]
    const placement = placeCallout(
      request({
        tiers: [
          { rects: [NODE], paths: [] },
          { rects: blockers, paths: [] },
        ],
      }),
    )
    const card = cardOf(placement)
    expect(placement!.side).toBe('top')
    expect(placement!.reachPx).toBeGreaterThan(10)
    for (const blocker of blockers) expect(rectsOverlap(card, blocker)).toBe(false)
  })

  it('follows the viewport: the place moves and scales with the camera', () => {
    const plain = placeCallout(request())!
    const moved = placeCallout(request({ viewport: { x: -100, y: 40, zoom: 1 } }))!
    expect(moved.x).toBeCloseTo(plain.x - 100)
    expect(moved.y).toBeCloseTo(plain.y + 40)

    const zoomed = placeCallout(request({ viewport: { x: -300, y: -200, zoom: 2 } }))!
    const node = { x: NODE.x * 2 - 300, y: NODE.y * 2 - 200, width: NODE.width * 2, height: NODE.height * 2 }
    expect(rectsOverlap(cardOf(zoomed), node)).toBe(false)
    expect(inside(cardOf(zoomed), BOUNDS)).toBe(true)
  })

  it('gives the same place for the same request', () => {
    expect(placeCallout(request())).toEqual(placeCallout(request()))
  })

  it('gives no place when the anchor is outside the bounds', () => {
    expect(placeCallout(request({ anchor: { kind: 'rect', rect: { ...NODE, x: 2000 }, topClear: 0 } }))).toBeNull()
    const path = buildArcTable('M2000,100 L2400,100')
    expect(placeCallout(request({ anchor: { kind: 'path', path } }))).toBeNull()
  })

  it('shows the card at the edge of the bounds, without a tail, when no place next to the anchor is free', () => {
    const big = { x: 20, y: 20, width: 960, height: 520 }
    const placement = placeCallout(
      request({ anchor: { kind: 'rect', rect: big, topClear: 0 }, tiers: [{ rects: [big], paths: [] }, NONE] }),
    )
    const card = cardOf(placement)
    expect(placement!.side).toBeUndefined()
    expect(inside(card, BOUNDS)).toBe(true)
  })
})
