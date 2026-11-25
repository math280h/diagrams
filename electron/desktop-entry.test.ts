import { describe, expect, it } from 'vitest'
import { BACKGROUND_ARG } from '@/desktop/constants'
import { entryProgram, entryValues, execValue, stringValue } from './desktop-entry'

describe('execValue', () => {
  it('writes plain arguments as they are', () => {
    expect(execValue(['/opt/Diagrams/diagrams', BACKGROUND_ARG])).toBe('/opt/Diagrams/diagrams --background')
  })

  it('quotes and escapes arguments with spaces and reserved characters, as the Desktop Entry Specification asks', () => {
    expect(execValue(['/home/a b/Diagrams.AppImage'])).toBe('"/home/a b/Diagrams.AppImage"')
    expect(execValue(['/home/$user/50%/"x"'])).toBe('"/home/\\\\$user/50%%/\\\\"x\\\\""')
    expect(execValue(['C:\\Apps\\Diagrams.exe'])).toBe('"C:\\\\\\\\Apps\\\\\\\\Diagrams.exe"')
  })

  it('refuses a path with a line break', () => {
    expect(() => execValue(['/home/a\nb/diagrams'])).toThrow('line break')
  })
})

describe('stringValue', () => {
  it('doubles each backslash and refuses a line break', () => {
    expect(stringValue('/home/a\\b')).toBe('/home/a\\\\b')
    expect(() => stringValue('/home/a\rb')).toThrow('line break')
  })
})

describe('entryValues', () => {
  it('reads only the main group, with spaces around =', () => {
    const values = entryValues(
      '[Desktop Entry]\r\nName = Diagrams\nExec=/opt/Diagrams/diagrams %U\n\n[Desktop Action new]\nExec=/other\n',
    )
    expect(values.get('Name')).toBe('Diagrams')
    expect(values.get('Exec')).toBe('/opt/Diagrams/diagrams %U')
  })
})

describe('entryProgram', () => {
  it('reads TryExec first', () => {
    expect(entryProgram('[Desktop Entry]\nTryExec=/home/a\\\\b/x.AppImage\nExec=/other %U\n')).toBe(
      '/home/a\\b/x.AppImage',
    )
  })

  it('reads the first argument of Exec, also in quotes, as execValue writes it', () => {
    for (const program of ['/opt/Diagrams/diagrams', '/home/a b/Diagrams.AppImage', '/home/$user/50%/"x"']) {
      expect(entryProgram(`[Desktop Entry]\nExec=${execValue([program])} %U\n`)).toBe(program)
    }
    expect(entryProgram('[Desktop Entry]\nExec=diagrams %U\n')).toBe('diagrams')
  })

  it('returns null without a program', () => {
    expect(entryProgram('[Desktop Entry]\nName=Diagrams\n')).toBeNull()
    expect(entryProgram('[Desktop Entry]\nExec="/no/end\n')).toBeNull()
  })
})
