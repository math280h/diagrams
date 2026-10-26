import { describe, expect, it } from 'vitest'
import { MERMAID_STROKES } from '@/export/mermaid'
import { nearestColor } from './colors'

function rgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

describe('nearestColor', () => {
  it('reads greys, white, black and pale tints as neutral', () => {
    for (const hex of ['#000000', '#ffffff', '#333333', '#9a9a9a', '#ececff', '#f4f4f4']) {
      expect(nearestColor(rgb(hex)), hex).toBe('neutral')
    }
  })

  it('finds the palette colour of common Mermaid fills', () => {
    expect(nearestColor(rgb('#ff9966'))).toBe('orange')
    expect(nearestColor(rgb('#ffff99'))).toBe('yellow')
    expect(nearestColor(rgb('#99ff99'))).toBe('green')
    expect(nearestColor(rgb('#2a9d8f'))).toBe('teal')
    expect(nearestColor(rgb('#bbbbff'))).toBe('blue')
    expect(nearestColor(rgb('#add8e6'))).toBe('blue')
    expect(nearestColor(rgb('#ff99ff'))).toBe('pink')
    expect(nearestColor(rgb('#800080'))).toBe('pink')
    expect(nearestColor(rgb('#ff0000'))).toBe('red')
    expect(nearestColor(rgb('#ff6666'))).toBe('red')
  })

  it('reads each colour of the Mermaid export as that colour', () => {
    for (const [color, hex] of Object.entries(MERMAID_STROKES)) expect(nearestColor(rgb(hex)), hex).toBe(color)
  })
})
