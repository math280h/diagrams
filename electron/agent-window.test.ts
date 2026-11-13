import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { agentWindowShow, createIdleClose } from './agent-window'

describe('agentWindowShow', () => {
  it('keeps the window hidden for a tool that only reads, in each mode', () => {
    expect(agentWindowShow('show', true)).toBeNull()
    expect(agentWindowShow('focus', true)).toBeNull()
    expect(agentWindowShow('hidden', true)).toBeNull()
  })

  it('shows the window for a change as the setting asks', () => {
    expect(agentWindowShow('show', false)).toBe('inactive')
    expect(agentWindowShow('focus', false)).toBe('focus')
    expect(agentWindowShow('hidden', false)).toBeNull()
  })
})

describe('createIdleClose', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('closes after the delay without a running call, and a new call cancels the close', () => {
    const close = vi.fn()
    const calls = createIdleClose(1000, close)
    const endFirst = calls.start()
    const endSecond = calls.start()
    endFirst()
    vi.advanceTimersByTime(5000)
    expect(close).not.toHaveBeenCalled()

    endSecond()
    endSecond()
    vi.advanceTimersByTime(999)
    const endThird = calls.start()
    vi.advanceTimersByTime(5000)
    expect(close).not.toHaveBeenCalled()

    endThird()
    vi.advanceTimersByTime(1000)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('cancels a due close when the app stops', () => {
    const close = vi.fn()
    const calls = createIdleClose(1000, close)
    calls.start()()
    calls.stop()
    vi.advanceTimersByTime(1000)
    expect(close).not.toHaveBeenCalled()
  })
})
