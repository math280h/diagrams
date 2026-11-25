import { describe, expect, it } from 'vitest'
import { currentIconName } from './aliases'

const ALIASES = { 'alert-triangle': 'triangle-alert', 'logo:oldslug': 'logo:newslug' }

describe('currentIconName', () => {
  it('gives the current name of an alias', () => {
    expect(currentIconName('alert-triangle', ALIASES)).toBe('triangle-alert')
    expect(currentIconName('logo:oldslug', ALIASES)).toBe('logo:newslug')
  })

  it('keeps a name without an alias, also a name of an object property', () => {
    expect(currentIconName('database', ALIASES)).toBe('database')
    expect(currentIconName('constructor', ALIASES)).toBe('constructor')
    expect(currentIconName('toString')).toBe('toString')
  })
})
