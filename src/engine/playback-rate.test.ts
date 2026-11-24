import { describe, expect, it } from 'vitest'
import { nextRate, PLAYBACK_RATES, rateLabel } from './playback-rate'

describe('nextRate', () => {
  it('steps through the speeds in order', () => {
    expect(nextRate(1, 1)).toBe(1.25)
    expect(nextRate(1, -1)).toBe(0.75)
    expect(nextRate(0.75, 1)).toBe(1)
  })

  it('stays at the slowest and the fastest speed', () => {
    expect(nextRate(0.5, -1)).toBe(0.5)
    expect(nextRate(2, 1)).toBe(2)
  })

  it('moves a speed that is not in the list to the nearest speed in the direction', () => {
    expect(nextRate(1.1, 1)).toBe(1.25)
    expect(nextRate(1.1, -1)).toBe(1)
  })
})

describe('rateLabel', () => {
  it('names each speed of the list', () => {
    expect(PLAYBACK_RATES.map(rateLabel)).toEqual(['0.5×', '0.75×', '1×', '1.25×', '1.5×', '2×'])
  })
})
