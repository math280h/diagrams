import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ICON_SOURCES } from './icons/sources.ts'
import { chromiumProjects, electronComponent, fontComponent, iconSetComponent } from './sbom-components.ts'

const VERSIONS = {
  node: '24.22.0',
  ares: '1.34.8',
  nghttp3: '',
  modules: '150',
  napi: '10',
  openssl: '0.0.0',
  sqlite: '3.53.4',
  tz: '2026e',
  newpart: '1.2.3',
  v8: '15.6.75.19-electron.0',
  electron: '45.0.0',
  chrome: '156.0.8078.48',
}

describe('SBOM components', () => {
  it('reads each project of Chromium once, with its homepage', () => {
    const html = [
      '<div class="product"><span class="title">FFmpeg</span>',
      '<span class="homepage"><a href="https://ffmpeg.org/">homepage</a></span></div>',
      '<div class="product"><span class="title">Paul Hsieh&#x27;s SuperFastHash</span>',
      '<span class="homepage"><a href="Not available">homepage</a></span></div>',
      '<div class="product"><span class="title">FFmpeg</span>',
      '<span class="homepage"><a href="https://ffmpeg.org/">homepage</a></span></div>',
    ].join('\n')
    expect(chromiumProjects(html)).toEqual([
      { type: 'library', name: 'FFmpeg', externalReferences: [{ type: 'website', url: 'https://ffmpeg.org/' }] },
      { type: 'library', name: "Paul Hsieh's SuperFastHash" },
    ])
  })

  it('puts Chromium, V8 and Node.js inside Electron, and the projects of Node.js inside Node.js', () => {
    const chromium = [{ type: 'library', name: 'FFmpeg' }]
    const electron = electronComponent(VERSIONS, chromium)
    expect(electron).toMatchObject({
      type: 'framework',
      name: 'electron',
      version: '45.0.0',
      purl: 'pkg:npm/electron@45.0.0',
      cpe: 'cpe:2.3:a:electronjs:electron:45.0.0:*:*:*:*:node.js:*:*',
    })
    const [chrome, v8, node] = electron.components!
    expect(chrome).toMatchObject({
      name: 'Chromium',
      version: '156.0.8078.48',
      cpe: 'cpe:2.3:a:google:chrome:156.0.8078.48:*:*:*:*:*:*:*',
      components: chromium,
    })
    expect(v8).toMatchObject({ name: 'V8', version: '15.6.75.19-electron.0' })
    expect(node).toMatchObject({ name: 'Node.js', version: '24.22.0', purl: 'pkg:github/nodejs/node@v24.22.0' })
    expect(node!.components).toEqual([
      {
        type: 'library',
        name: 'c-ares',
        version: '1.34.8',
        purl: 'pkg:generic/c-ares@1.34.8',
        cpe: 'cpe:2.3:a:c-ares:c-ares:1.34.8:*:*:*:*:*:*:*',
      },
      {
        type: 'library',
        name: 'SQLite',
        version: '3.53.4',
        purl: 'pkg:generic/sqlite@3.53.4',
        cpe: 'cpe:2.3:a:sqlite:sqlite:3.53.4:*:*:*:*:*:*:*',
      },
      {
        type: 'data',
        name: 'IANA time zone database',
        version: '2026e',
        purl: 'pkg:generic/iana-time-zone-database@2026e',
      },
      { type: 'library', name: 'newpart', version: '1.2.3', purl: 'pkg:generic/newpart@1.2.3' },
    ])
  })

  it('describes the font in a Fontsource package', () => {
    const font = fontComponent({
      id: 'inter',
      family: 'Inter',
      version: 'v20',
      source: 'https://github.com/google/fonts',
      license: {
        type: 'OFL-1.1',
        url: 'https://openfontlicense.org',
        attribution: 'Copyright 2016 The Inter Project Authors',
      },
    })
    expect(font).toEqual({
      type: 'data',
      name: 'Inter',
      version: 'v20',
      purl: 'pkg:generic/inter@v20',
      copyright: 'Copyright 2016 The Inter Project Authors',
      licenses: [{ license: { id: 'OFL-1.1' } }],
      externalReferences: [{ type: 'vcs', url: 'https://github.com/google/fonts' }],
    })
  })

  it('describes an icon set with the hash of its data file and the logos that have their own licence', () => {
    const simpleIcons = ICON_SOURCES.find((source) => source.file === 'logos')!
    const set = iconSetComponent(simpleIcons, {
      version: '16.35.0',
      sha256: 'ab'.repeat(32),
      logos: [
        { title: 'Angular', source: 'https://angular.dev/press-kit', license: { type: 'CC-BY-4.0' } },
        { title: 'Tauri', source: 'https://tauri.app', license: { type: 'custom', url: 'https://tauri.app/license' } },
      ],
    })
    expect(set).toMatchObject({
      type: 'data',
      name: 'Simple Icons',
      version: '16.35.0',
      purl: 'pkg:npm/simple-icons@16.35.0',
      licenses: [{ license: { id: 'CC0-1.0' } }],
      hashes: [{ alg: 'SHA-256', content: 'ab'.repeat(32) }],
    })
    expect(set.components).toEqual([
      {
        type: 'data',
        name: 'Angular',
        licenses: [{ license: { id: 'CC-BY-4.0' } }],
        externalReferences: [{ type: 'website', url: 'https://angular.dev/press-kit' }],
      },
      {
        type: 'data',
        name: 'Tauri',
        licenses: [{ license: { name: 'Custom terms of the owner', url: 'https://tauri.app/license' } }],
        externalReferences: [{ type: 'website', url: 'https://tauri.app' }],
      },
    ])
    const gcp = iconSetComponent(
      ICON_SOURCES.find((source) => source.file === 'gcp')!,
      { sha256: 'cd'.repeat(32) },
    )
    expect(gcp.version).toBeUndefined()
    expect(gcp.externalReferences).toHaveLength(3)
  })

  it('has a source for each icon set in the data folder', () => {
    const files = readdirSync('src/canvas/icons/data')
      .filter((file) => file.endsWith('.json') && file !== 'templates.json')
      .map((file) => file.replace(/\.json$/, ''))
    expect(ICON_SOURCES.map((source) => source.file).toSorted()).toEqual(files.toSorted())
  })
})
