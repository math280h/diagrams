import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDetailsHover } from './details-hover'

describe('createDetailsHover', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows a node on hover, keeps it while the pointer moves to the card, and hides it after', () => {
    const hover = createDetailsHover()
    hover.enter('a')
    expect(hover.getState()).toEqual({ nodeId: 'a', pinned: false })
    hover.leave()
    hover.holdCard()
    vi.advanceTimersByTime(1000)
    expect(hover.getState().nodeId).toBe('a')
    hover.leave()
    vi.advanceTimersByTime(1000)
    expect(hover.getState().nodeId).toBeNull()
  })

  it('pins a node on click until a second click or a close', () => {
    const hover = createDetailsHover()
    hover.toggle('a')
    hover.enter('b')
    hover.leave()
    vi.advanceTimersByTime(1000)
    expect(hover.getState()).toEqual({ nodeId: 'a', pinned: true })
    hover.toggle('a')
    expect(hover.getState()).toEqual({ nodeId: null, pinned: false })
    hover.toggle('b')
    hover.close()
    expect(hover.getState().nodeId).toBeNull()
  })
})
