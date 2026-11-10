import { describe, expect, it } from 'vitest'
import { headerDescription, parseHeader } from './conventional-commits.ts'

describe('parseHeader', () => {
  it('reads the type, the scope, the breaking mark and the description', () => {
    expect(parseHeader('fix(editor)!: keep the toolbar in view')).toEqual({
      type: 'fix',
      scope: 'editor',
      breaking: true,
      description: 'keep the toolbar in view',
    })
    expect(parseHeader('feat: show the editor in link previews (#157)')).toEqual({
      type: 'feat',
      scope: null,
      breaking: false,
      description: 'show the editor in link previews (#157)',
    })
    expect(parseHeader('chore(deps-dev): bump vitest from 5.0.4 to 5.0.5')?.scope).toBe('deps-dev')
  })

  it('refuses a title without a header, with an unknown type or without a description', () => {
    expect(parseHeader('Show the editor in link previews')).toBeNull()
    expect(parseHeader('feature: add a minimap')).toBeNull()
    expect(parseHeader('Fix: add a minimap')).toBeNull()
    expect(parseHeader('fix:keep the toolbar in view')).toBeNull()
    expect(parseHeader('fix: ')).toBeNull()
    expect(parseHeader('fix(): keep the toolbar in view')).toBeNull()
  })
})

describe('headerDescription', () => {
  it('gives the description in sentence case, and other text as it is', () => {
    expect(headerDescription('feat(export): add WebM video')).toBe('Add WebM video')
    expect(headerDescription('Resize the editor panels')).toBe('Resize the editor panels')
  })
})
