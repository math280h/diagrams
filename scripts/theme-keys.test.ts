import { describe, expect, it } from 'vitest'
import { keysOf, removedKeys, withKeys } from './theme-keys.ts'

describe('keysOf', () => {
  it('gives the keys of each group and the earlier names that a version reads', () => {
    const tokens = {
      APP_COLORS: ['text'],
      CANVAS_COLORS: ['background'],
      CANVAS_PERCENTS: ['hue-fill'],
      CANVAS_OPACITIES: ['dim-explore'],
      WINDOW_COLORS: ['border'],
      THEME_KEY_ALIASES: { app: { foreground: 'text' }, canvas: { ground: 'background' }, window: {} },
    }
    expect(keysOf(tokens)).toEqual({
      app: ['text', 'foreground'],
      canvas: ['background', 'hue-fill', 'dim-explore', 'ground'],
      window: ['border'],
    })
  })

  it('reads a version without aliases', () => {
    const tokens = {
      APP_COLORS: ['foreground'],
      CANVAS_COLORS: [],
      CANVAS_PERCENTS: [],
      CANVAS_OPACITIES: [],
      WINDOW_COLORS: [],
    }
    expect(keysOf(tokens)).toEqual({ app: ['foreground'], canvas: [], window: [] })
  })
})

describe('withKeys', () => {
  it('adds new keys to their groups in order and keeps every key of the list', () => {
    const list = { app: ['foreground', 'background'], canvas: ['ground'], window: [] }
    expect(withKeys(list, { app: ['text', 'background'], window: ['border'] })).toEqual({
      app: ['background', 'foreground', 'text'],
      canvas: ['ground'],
      window: ['border'],
    })
  })

  it('writes the groups of a theme file first', () => {
    expect(Object.keys(withKeys({ window: [], canvas: [] }, { app: ['text'] }))).toEqual(['app', 'canvas', 'window'])
  })
})

describe('removedKeys', () => {
  it('finds the keys of the base list that the new list does not have', () => {
    const base = { app: ['foreground', 'text'], canvas: ['ground'] }
    expect(removedKeys(base, { app: ['foreground', 'text', 'popup'], canvas: ['ground'] })).toEqual([])
    expect(removedKeys(base, { app: ['text'] })).toEqual(['app.foreground', 'canvas.ground'])
  })
})
