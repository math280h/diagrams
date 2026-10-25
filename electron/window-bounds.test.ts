import { describe, expect, test } from 'vitest'
import { parseWindowState, restorableBounds } from './window-bounds'

const primary = { x: 0, y: 0, width: 1920, height: 1040 }
const secondary = { x: 1920, y: 0, width: 2560, height: 1400 }

describe('restorableBounds', () => {
  test('keeps bounds that are fully on a screen', () => {
    const saved = { x: 2100, y: 80, width: 1400, height: 900 }
    expect(restorableBounds(saved, [primary, secondary])).toEqual(saved)
  })

  test('returns null when the screen of the saved bounds is gone', () => {
    expect(restorableBounds({ x: 2100, y: 80, width: 1400, height: 900 }, [primary])).toBeNull()
  })

  test('moves a window that hangs off the edge back onto the screen', () => {
    expect(restorableBounds({ x: 1500, y: -40, width: 800, height: 600 }, [primary])).toEqual({
      x: 1120,
      y: 0,
      width: 800,
      height: 600,
    })
  })

  test('shrinks a window that is larger than the screen', () => {
    expect(restorableBounds({ x: 0, y: 0, width: 2560, height: 1400 }, [primary])).toEqual(primary)
  })
})

describe('parseWindowState', () => {
  test('reads a saved state', () => {
    const raw = { bounds: { x: 10, y: 20, width: 800, height: 600 }, maximized: true, fullScreen: false }
    expect(parseWindowState(raw)).toEqual(raw)
  })

  test('drops bounds that are not valid', () => {
    expect(parseWindowState({ bounds: { x: 'a', y: 0, width: 0, height: 10 }, maximized: 'yes' })).toEqual({
      bounds: null,
      maximized: false,
      fullScreen: false,
    })
  })
})
