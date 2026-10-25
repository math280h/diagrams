import { describe, expect, it } from 'vitest'
import { DEFAULT_TRAFFIC } from '@/model/defaults'
import { hashUnit } from './hash'
import { dashPattern, MAX_PARTICLES_PER_EDGE, marchOffsetPx, particleCount, particleProgress } from './traffic'

describe('particleCount', () => {
  it('scales with the path length and the density', () => {
    expect(particleCount({ ...DEFAULT_TRAFFIC, density: 2 }, 300)).toBe(6)
  })

  it('keeps at least one and at most the maximum', () => {
    expect(particleCount({ ...DEFAULT_TRAFFIC, density: 0.1 }, 10)).toBe(1)
    expect(particleCount({ ...DEFAULT_TRAFFIC, density: 10 }, 10_000)).toBe(MAX_PARTICLES_PER_EDGE)
    expect(particleCount(DEFAULT_TRAFFIC, 0)).toBe(0)
  })
})

describe('particleProgress', () => {
  const traffic = { ...DEFAULT_TRAFFIC, speed: 100 }

  it('stays between 0 and 1', () => {
    for (let time = 0; time < 20_000; time += 777) {
      const u = particleProgress(traffic, 0.3, 2, 5, time, 240)
      expect(u).toBeGreaterThanOrEqual(0)
      expect(u).toBeLessThan(1)
    }
  })

  it('moves the speed distance in one second', () => {
    const start = particleProgress(traffic, 0, 0, 1, 0, 400)
    const later = particleProgress(traffic, 0, 0, 1, 1000, 400)
    expect(later - start).toBeCloseTo(0.25, 5)
  })

  it('moves backwards in reverse direction', () => {
    const reverse = { ...traffic, direction: 'reverse' as const }
    const start = particleProgress(reverse, 0.5, 0, 1, 0, 400)
    const later = particleProgress(reverse, 0.5, 0, 1, 500, 400)
    expect(later).toBeLessThan(start)
  })

  it('gives the same result for the same time', () => {
    const seed = hashUnit('edge-1')
    expect(particleProgress(traffic, seed, 1, 3, 4321, 300)).toBe(particleProgress(traffic, seed, 1, 3, 4321, 300))
  })
})

describe('dashes', () => {
  it('makes a pulse longer than the gap between particles', () => {
    const pattern = dashPattern({ ...DEFAULT_TRAFFIC, style: 'pulse' }, 500)
    expect(pattern.gap).toBeGreaterThanOrEqual(500)
  })

  it('moves the offset with time', () => {
    const traffic = { ...DEFAULT_TRAFFIC, speed: 50 }
    expect(marchOffsetPx(traffic, 0, 0, 1000)).toBe(-0)
    expect(marchOffsetPx(traffic, 0, 1000, 1000)).toBe(-50)
  })
})
