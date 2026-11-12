import { beforeEach, describe, expect, it } from 'vitest'
import { themeFileName } from './copy'
import { allThemes, customThemeId, findTheme, setThemeFiles, useThemeStore } from './store'

beforeEach(() => setThemeFiles('browser', []))

describe('theme files of the user', () => {
  it('adds the themes that it can read, and keeps the problem of each other file', () => {
    setThemeFiles('folder', [
      { name: 'zebra', text: JSON.stringify({ name: 'Zebra', base: 'light' }) },
      { name: 'broken', text: '{' },
      { name: 'Bad Name', text: JSON.stringify({ name: 'Bad', base: 'dark' }) },
    ])
    const { place, files } = useThemeStore.getState()
    expect(place).toBe('folder')
    expect(files.map((file) => [file.name, file.theme?.name ?? null, file.problem !== null])).toEqual([
      ['Bad Name', null, true],
      ['broken', null, true],
      ['zebra', 'Zebra', false],
    ])
    expect(findTheme(customThemeId('zebra'))?.name).toBe('Zebra')
    expect(allThemes().map((theme) => theme.id)).toContain('custom:zebra')
    expect(findTheme('graphite')?.name).toBe('Graphite')
  })
})

describe('themeFileName', () => {
  it('makes a file name from a theme name that no other theme file has', () => {
    expect(themeFileName('Graphite copy', new Set())).toBe('graphite-copy')
    expect(themeFileName('Graphite copy', new Set(['graphite-copy', 'graphite-copy-2']))).toBe('graphite-copy-3')
    expect(themeFileName('Café — Nuit!', new Set())).toBe('cafe-nuit')
    expect(themeFileName('***', new Set())).toBe('theme')
  })
})
