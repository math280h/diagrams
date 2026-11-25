import { describe, expect, it } from 'vitest'
import { isInsideFolder, runningAppImage } from './appimage'

describe('runningAppImage', () => {
  it('returns the AppImage when the app runs from inside APPDIR', () => {
    const env = { APPIMAGE: '/home/a/Diagrams.AppImage', APPDIR: '/tmp/.mount_Diagra1' }
    expect(runningAppImage(env, '/tmp/.mount_Diagra1/diagrams')).toBe('/home/a/Diagrams.AppImage')
  })

  it('ignores the variables of another AppImage, for example of the terminal that started the app', () => {
    const env = { APPIMAGE: '/home/a/Editor.AppImage', APPDIR: '/tmp/.mount_Editor' }
    expect(runningAppImage(env, '/opt/Diagrams/diagrams')).toBeNull()
    expect(runningAppImage(env, '/tmp/.mount_Editor2/diagrams')).toBeNull()
    expect(runningAppImage(env, '/tmp/.mount_Editor')).toBeNull()
  })

  it('needs both variables and an absolute AppImage path', () => {
    expect(runningAppImage({ APPIMAGE: '/home/a/Diagrams.AppImage' }, '/tmp/.mount_x/diagrams')).toBeNull()
    expect(runningAppImage({ APPDIR: '/tmp/.mount_x' }, '/tmp/.mount_x/diagrams')).toBeNull()
    expect(runningAppImage({ APPIMAGE: 'Diagrams.AppImage', APPDIR: '/tmp/.mount_x' }, '/tmp/.mount_x/d')).toBeNull()
  })
})

describe('isInsideFolder', () => {
  it('counts the folder and its contents, and not a folder with a longer name', () => {
    expect(isInsideFolder('/tmp/.mount_x', '/tmp/.mount_x/')).toBe(true)
    expect(isInsideFolder('/tmp/.mount_x/usr/lib', '/tmp/.mount_x')).toBe(true)
    expect(isInsideFolder('/tmp/.mount_x2/usr/lib', '/tmp/.mount_x')).toBe(false)
    expect(isInsideFolder('/usr/lib', '/tmp/.mount_x')).toBe(false)
  })
})
