import { describe, expect, it, vi } from 'vitest'
import { createFlow } from '@/model/defaults'
import type { Flow, Step } from '@/model/schema'
import { compileFlow, type Timeline } from './flow/compile'
import { Playback } from './engine'

function step(id: string, durationMs: number): Step {
  return {
    id: `step-${id}`,
    target: { kind: 'node', id },
    caption: '',
    event: '',
    latencyMs: null,
    level: 'info',
    durationMs,
    camera: 'follow',
    zoom: 1,
  }
}

function timeline(durationsMs: number[], patch: Partial<Flow> = {}): Timeline {
  const ids = durationsMs.map((_, index) => `n${index}`)
  const flow = { ...createFlow('Test'), steps: ids.map((id, index) => step(id, durationsMs[index]!)), ...patch }
  return compileFlow(flow, new Set(ids), [])
}

function loaded(durationsMs = [1000, 1000, 1000], patch: Partial<Flow> = {}) {
  const playback = new Playback()
  playback.load('flow', timeline(durationsMs, patch))
  return playback
}

describe('Playback', () => {
  it('starts a new flow at the beginning, paused, and tells its listeners', () => {
    const playback = loaded()
    playback.play()
    playback.tick(500)
    const listener = vi.fn()
    playback.subscribe(listener)
    playback.load('other', timeline([2000]))
    expect(playback.getSnapshot()).toMatchObject({ flowId: 'other', playing: false, durationMs: 2000 })
    expect(playback.time.get()).toBe(0)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('keeps the time of the same flow and limits it to a shorter timeline', () => {
    const playback = loaded()
    playback.seek(2500)
    playback.load('flow', timeline([1000, 1000]))
    expect(playback.time.get()).toBe(2000)
    playback.load('flow', timeline([1000, 1000, 1000]))
    expect(playback.time.get()).toBe(2000)
  })

  it('gives a new snapshot for each change and the same one between changes', () => {
    const playback = loaded()
    const first = playback.getSnapshot()
    expect(playback.getSnapshot()).toBe(first)
    playback.setRate(2)
    const second = playback.getSnapshot()
    expect(second).not.toBe(first)
    expect(second.rate).toBe(2)
    playback.setFollow(false)
    expect(playback.getSnapshot()).toMatchObject({ rate: 2, follow: false })
  })

  it('stops telling a listener after it unsubscribes', () => {
    const playback = loaded()
    const listener = vi.fn()
    const unsubscribe = playback.subscribe(listener)
    playback.pause()
    unsubscribe()
    playback.play()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('plays only with a timeline', () => {
    const playback = new Playback()
    playback.play()
    expect(playback.playing).toBe(false)
    expect(playback.durationMs).toBe(0)
  })

  it('asks for a camera glide when it starts to play, and not again while it plays', () => {
    const playback = loaded()
    playback.play()
    expect(playback.handoffRequest).toBe(true)
    playback.handoffRequest = false
    playback.play()
    expect(playback.handoffRequest).toBe(false)
  })

  it('plays again from the start after the end', () => {
    const playback = loaded()
    playback.seek(3000)
    playback.play()
    expect(playback.time.get()).toBe(0)
    expect(playback.playing).toBe(true)
  })

  it('switches between play and pause', () => {
    const playback = loaded()
    playback.toggle()
    expect(playback.playing).toBe(true)
    playback.toggle()
    expect(playback.playing).toBe(false)
  })

  it('advances the time at the playback rate only while it plays', () => {
    const playback = loaded()
    playback.tick(100)
    expect(playback.time.get()).toBe(0)
    playback.play()
    playback.setRate(1.5)
    playback.tick(200)
    expect(playback.time.get()).toBe(300)
  })

  it('stops at the end of a flow that does not loop and tells its listeners', () => {
    const playback = loaded()
    playback.play()
    const listener = vi.fn()
    playback.subscribe(listener)
    playback.tick(2900)
    playback.tick(500)
    expect(playback.time.get()).toBe(3000)
    expect(playback.playing).toBe(false)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('goes round to the start of a flow that loops', () => {
    const playback = loaded([1000, 1000, 1000], { loop: true })
    playback.play()
    playback.tick(3200)
    expect(playback.time.get()).toBe(200)
    expect(playback.playing).toBe(true)
  })

  it('seeks within the timeline and asks the camera to follow', () => {
    const playback = loaded()
    playback.seek(-50)
    expect(playback.time.get()).toBe(0)
    playback.seek(99_999)
    expect(playback.time.get()).toBe(3000)
    expect(playback.cameraRequest).toBe(true)
    expect(playback.handoffRequest).toBe(true)
  })
})
