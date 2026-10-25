import { describe, expect, it } from 'vitest'
import { shortcutLetter } from './keys'

function press(key: string, code: string) {
  return { key, code } as KeyboardEvent
}

describe('shortcutLetter', () => {
  it('uses the character of a Latin layout', () => {
    expect(shortcutLetter(press('n', 'KeyN'))).toBe('n')
    expect(shortcutLetter(press('N', 'KeyN'))).toBe('n')
    expect(shortcutLetter(press('n', 'KeyL'))).toBe('n')
  })

  it('uses the physical key on a layout without Latin letters', () => {
    expect(shortcutLetter(press('т', 'KeyN'))).toBe('n')
  })

  it('returns other keys unchanged', () => {
    expect(shortcutLetter(press('?', 'Minus'))).toBe('?')
    expect(shortcutLetter(press('Escape', 'Escape'))).toBe('escape')
  })
})
