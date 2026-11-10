import { describe, expect, it } from 'vitest'
import { longHexColor } from './chrome'

describe('longHexColor', () => {
  it('writes a short hex colour in full, so that the window buttons get the light theme too', () => {
    expect(longHexColor('#fff')).toBe('#ffffff')
    expect(longHexColor('#0aF')).toBe('#00aaFF')
  })

  it('keeps a long hex colour and other colours as they are', () => {
    expect(longHexColor('#0a0a0a')).toBe('#0a0a0a')
    expect(longHexColor('oklch(1 0 0)')).toBe('oklch(1 0 0)')
    expect(longHexColor('')).toBe('')
  })
})
