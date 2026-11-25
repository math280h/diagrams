import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { APPIMAGE_LINK_ENTRY } from '@/desktop/constants'
import { entryProgram, execValue } from './desktop-entry'

vi.mock('electron', () => ({ app: {} }))

const {
  hostEnvironment,
  LINK_MIME_TYPE,
  linkCommand,
  linkEntry,
  linkPlan,
  linkSystem,
  registerAppImageLinks,
  updateLinkEntry,
} = await import('./appimage-links')

type LinkHandler = Parameters<typeof linkPlan>[0]

const APP = ['/apps/Diagrams.AppImage']
const folders: string[] = []

afterEach(() => {
  vi.unstubAllEnvs()
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

function tempFolder() {
  const folder = mkdtempSync(path.join(tmpdir(), 'appimage-links-'))
  folders.push(folder)
  return folder
}

function fakeSystem(handlerAnswer: string | Error) {
  const root = tempFolder()
  const user = path.join(root, 'home', 'applications')
  const system = path.join(root, 'usr', 'applications')
  const bin = path.join(root, 'bin')
  mkdirSync(system, { recursive: true })
  mkdirSync(bin, { recursive: true })
  const calls: string[][] = []
  const run = vi.fn(async (program: string, args: readonly string[]) => {
    calls.push([program, ...args])
    if (program === 'xdg-mime' && args[0] === 'query') {
      if (handlerAnswer instanceof Error) throw handlerAnswer
      return `${handlerAnswer}\n`
    }
    return ''
  })
  return { root, user, system, bin, calls, links: { entryFolders: [user, system], programFolders: [bin], run } }
}

describe('hostEnvironment', () => {
  it('removes the folders of the AppImage, and a variable that only the AppImage set', () => {
    const appDir = '/tmp/.mount_x'
    const host = hostEnvironment(
      {
        PATH: '/tmp/.mount_x:/tmp/.mount_x/usr/sbin:/usr/bin:/bin',
        LD_LIBRARY_PATH: '/tmp/.mount_x/usr/lib',
        XDG_DATA_DIRS: '/tmp/.mount_x/usr/share/::/usr/share/gnome:/usr/local/share/:/usr/share/',
        GSETTINGS_SCHEMA_DIR: '/tmp/.mount_x/usr/share/glib-2.0/schemas:/opt/schemas',
        HOME: '/home/a',
      },
      appDir,
    )
    expect(host).toEqual({
      PATH: '/usr/bin:/bin',
      XDG_DATA_DIRS: '/usr/share/gnome:/usr/local/share/:/usr/share/',
      GSETTINGS_SCHEMA_DIR: '/opt/schemas',
      HOME: '/home/a',
    })
  })
})

describe('linkSystem', () => {
  const run = async () => ''

  it('uses the XDG folders, and the defaults for empty or relative values', () => {
    const system = linkSystem(
      { XDG_DATA_HOME: '/data', XDG_DATA_DIRS: '/a:relative:/b/', PATH: '/usr/bin' },
      '/home/a',
      run,
    )
    expect(system.entryFolders).toEqual(['/data/applications', '/a/applications', '/b/applications'])
    expect(system.programFolders).toEqual(['/usr/bin'])
    expect(linkSystem({ XDG_DATA_HOME: 'data' }, '/home/a', run).entryFolders).toEqual([
      '/home/a/.local/share/applications',
      '/usr/local/share/applications',
      '/usr/share/applications',
    ])
  })
})

describe('linkCommand', () => {
  it('keeps --no-sandbox of this start, and no other argument', () => {
    const appImage = '/apps/Diagrams.AppImage'
    expect(linkCommand(appImage, ['/tmp/.mount_x/diagrams', '--background'])).toEqual([appImage])
    expect(linkCommand(appImage, ['/tmp/.mount_x/diagrams', '--no-sandbox', 'diagrams://open'])).toEqual([
      appImage,
      '--no-sandbox',
    ])
  })
})

describe('linkEntry', () => {
  it('runs the AppImage with the link, names it in TryExec and handles only the link scheme', () => {
    const entry = linkEntry(['/home/a b/Diagrams 1.0.AppImage', '--no-sandbox'])
    expect(entry).toContain('\nTryExec=/home/a b/Diagrams 1.0.AppImage\n')
    expect(entry).toContain(`\nExec=${execValue(['/home/a b/Diagrams 1.0.AppImage'])} --no-sandbox %U\n`)
    expect(entry).toContain('\nNoDisplay=true\n')
    expect(entry).toContain(`\nMimeType=${LINK_MIME_TYPE};\n`)
    expect(LINK_MIME_TYPE).toBe('x-scheme-handler/diagrams')
    expect(entryProgram(entry.replace(/^TryExec=.*\n/m, ''))).toBe('/home/a b/Diagrams 1.0.AppImage')
  })

  it('refuses a path with a line break', () => {
    expect(() => linkEntry(['/home/a\nb/Diagrams.AppImage'])).toThrow('line break')
  })
})

describe('linkPlan', () => {
  const wanted = linkEntry(['/apps/Diagrams-1.1.AppImage'])
  const old = linkEntry(['/apps/Diagrams-1.0.AppImage'])
  const cases: [LinkHandler, string | null, { write: boolean; makeDefault: boolean }][] = [
    [{ kind: 'none' }, null, { write: true, makeDefault: true }],
    [{ kind: 'own' }, wanted, { write: false, makeDefault: false }],
    [{ kind: 'own' }, old, { write: true, makeDefault: false }],
    [{ kind: 'own' }, null, { write: true, makeDefault: false }],
    [{ kind: 'other', works: true }, null, { write: false, makeDefault: false }],
    [{ kind: 'other', works: true }, old, { write: true, makeDefault: false }],
    [{ kind: 'other', works: false }, null, { write: true, makeDefault: true }],
    [{ kind: 'other', works: false }, wanted, { write: false, makeDefault: true }],
    [{ kind: 'unknown' }, null, { write: false, makeDefault: false }],
    [{ kind: 'unknown' }, old, { write: true, makeDefault: false }],
  ]

  it.each(cases)('for the handler %o and the entry %#, it plans %o', (handler, current, plan) => {
    expect(linkPlan(handler, current, wanted)).toEqual(plan)
  })
})

describe('updateLinkEntry', () => {
  it('writes the entry and takes the links when no app has them', async () => {
    const { user, calls, links } = fakeSystem('')
    expect(await updateLinkEntry(APP, links)).toEqual({ write: true, makeDefault: true })
    expect(readFileSync(path.join(user, APPIMAGE_LINK_ENTRY), 'utf8')).toBe(linkEntry(APP))
    expect(calls).toEqual([
      ['xdg-mime', 'query', 'default', LINK_MIME_TYPE],
      ['update-desktop-database', user],
      ['xdg-mime', 'default', APPIMAGE_LINK_ENTRY, LINK_MIME_TYPE],
    ])
  })

  it('writes the new path after the AppImage moves, and changes nothing at the next start', async () => {
    const { user, calls, links } = fakeSystem(APPIMAGE_LINK_ENTRY)
    mkdirSync(user, { recursive: true })
    writeFileSync(path.join(user, APPIMAGE_LINK_ENTRY), linkEntry(['/apps/Diagrams-1.0.AppImage']))
    const moved = ['/apps/Diagrams-1.1.AppImage']
    expect(await updateLinkEntry(moved, links)).toEqual({ write: true, makeDefault: false })
    expect(readFileSync(path.join(user, APPIMAGE_LINK_ENTRY), 'utf8')).toContain('Diagrams-1.1.AppImage %U')
    calls.length = 0
    expect(await updateLinkEntry(moved, links)).toEqual({ write: false, makeDefault: false })
    expect(calls).toEqual([['xdg-mime', 'query', 'default', LINK_MIME_TYPE]])
  })

  it('leaves the links to the deb package while its program exists, and writes no entry', async () => {
    const { root, user, system, calls, links } = fakeSystem('diagrams.desktop')
    const program = path.join(root, 'opt', 'Diagrams', 'diagrams')
    mkdirSync(path.dirname(program), { recursive: true })
    writeFileSync(program, '')
    writeFileSync(path.join(system, 'diagrams.desktop'), `[Desktop Entry]\nExec=${execValue([program])} %U\n`)
    expect(await updateLinkEntry(APP, links)).toEqual({ write: false, makeDefault: false })
    expect(existsSync(user)).toBe(false)
    expect(calls).toHaveLength(1)

    rmSync(program)
    expect(await updateLinkEntry(APP, links)).toEqual({ write: true, makeDefault: true })
  })

  it('finds a handler in a subfolder and a program in PATH', async () => {
    const { bin, system, links } = fakeSystem('kde-diagrams.desktop')
    mkdirSync(path.join(system, 'kde'))
    writeFileSync(path.join(system, 'kde', 'diagrams.desktop'), '[Desktop Entry]\nExec=diagrams %U\n')
    expect(await updateLinkEntry(APP, links)).toMatchObject({ makeDefault: true })
    writeFileSync(path.join(bin, 'diagrams'), '')
    expect(await updateLinkEntry(APP, links)).toMatchObject({ makeDefault: false })
  })

  it('takes the links from a handler that is missing or hidden', async () => {
    const missing = fakeSystem('appimagekit_0123-Diagrams.desktop')
    expect(await updateLinkEntry(APP, missing.links)).toMatchObject({ makeDefault: true })

    const hidden = fakeSystem('diagrams.desktop')
    writeFileSync(path.join(hidden.bin, 'diagrams'), '')
    writeFileSync(path.join(hidden.system, 'diagrams.desktop'), '[Desktop Entry]\nExec=diagrams %U\nHidden=true\n')
    expect(await updateLinkEntry(APP, hidden.links)).toMatchObject({ makeDefault: true })
  })

  it('writes no new entry when xdg-mime cannot tell the handler', async () => {
    const { user, calls, links } = fakeSystem(new Error('spawn xdg-mime ENOENT'))
    expect(await updateLinkEntry(APP, links)).toEqual({ write: false, makeDefault: false })
    expect(existsSync(user)).toBe(false)
    expect(calls).toHaveLength(1)
  })
})

describe('registerAppImageLinks', () => {
  it('does nothing outside an AppImage', async () => {
    vi.stubEnv('APPIMAGE', '/home/a/Editor.AppImage')
    vi.stubEnv('APPDIR', '/tmp/.mount_Editor')
    expect(await registerAppImageLinks()).toBeNull()
  })
})
