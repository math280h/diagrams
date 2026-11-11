import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createThemeFiles, watchThemeFolder } from './theme-files'

let folder: string

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'dg-themes-'))
})

afterEach(() => {
  rmSync(folder, { recursive: true, force: true })
})

describe('theme files', () => {
  it('lists no themes when the diagrams folder has no themes folder', async () => {
    expect(await createThemeFiles(folder).list()).toEqual([])
  })

  it('reads the theme files of the themes folder and leaves other files out', async () => {
    const themes = path.join(folder, 'themes')
    mkdirSync(themes)
    writeFileSync(path.join(themes, 'brand.theme.json'), '{"name":"Brand","base":"dark"}')
    writeFileSync(path.join(themes, 'notes.txt'), 'not a theme')
    writeFileSync(path.join(themes, 'huge.theme.json'), 'x'.repeat(300 * 1024))
    expect(await createThemeFiles(folder).list()).toEqual([{ name: 'brand', text: '{"name":"Brand","base":"dark"}' }])
  })

  it('writes a new theme file, and does not replace a file with the same name', async () => {
    const files = createThemeFiles(folder)
    await files.write({ name: 'brand', text: 'first' })
    expect(readFileSync(path.join(folder, 'themes', 'brand.theme.json'), 'utf8')).toBe('first')
    await expect(files.write({ name: 'brand', text: 'second' })).rejects.toThrow()
    await expect(files.write({ name: '../escape', text: 'x' })).rejects.toThrow('small letters')
    expect(readFileSync(path.join(folder, 'themes', 'brand.theme.json'), 'utf8')).toBe('first')
  })

  it('reports a theme folder that appears after the watch starts', async () => {
    const files = createThemeFiles(folder)
    let changes = 0
    const stop = watchThemeFolder(files, () => changes++)
    try {
      await files.write({ name: 'brand', text: '{}' })
      await expect.poll(() => changes, { timeout: 5000 }).toBeGreaterThan(0)
    } finally {
      stop()
    }
  })
})
