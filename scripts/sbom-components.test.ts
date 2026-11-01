import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { parseAst } from 'vite'
import { describe, expect, it } from 'vitest'
import builderConfig from '../electron-builder.ts'
import { ICON_SOURCES } from './icons/sources.ts'
import {
  APPIMAGE_LIBRARIES,
  APPIMAGE_RUNTIME_SHA256,
  chromiumProjects,
  electronComponent,
  fontComponent,
  iconSetComponent,
  INSTALLER_TOOLSETS,
  installerComponent,
  packageComponent,
} from './sbom-components.ts'

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

type Expression = Extract<ReturnType<typeof parseAst>['body'][number], { type: 'ExpressionStatement' }>['expression']

function literalValue(node: Expression): unknown {
  if (node.type === 'Literal') return node.value
  if (node.type !== 'ObjectExpression') throw new Error(`${node.type} is not a literal.`)
  return Object.fromEntries(
    node.properties.map((property) => {
      if (property.type !== 'Property' || property.computed) throw new Error('The object has a computed key.')
      const { key } = property
      if (key.type === 'Identifier') return [key.name, literalValue(property.value)]
      if (key.type === 'Literal') return [String(key.value), literalValue(property.value)]
      throw new Error(`${key.type} is not a key.`)
    }),
  )
}

function exportedObject(file: string, name: string): unknown {
  for (const statement of parseAst(readFileSync(file, 'utf8')).body) {
    if (statement.type !== 'ExpressionStatement') continue
    const { expression } = statement
    if (
      expression.type === 'AssignmentExpression' &&
      expression.left.type === 'MemberExpression' &&
      expression.left.object.type === 'Identifier' &&
      expression.left.object.name === 'exports' &&
      expression.left.property.type === 'Identifier' &&
      expression.left.property.name === name &&
      expression.right.type === 'ObjectExpression'
    ) {
      return literalValue(expression.right)
    }
  }
  throw new Error(`${file} has no exports.${name} object.`)
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

  it('names the toolset bundles that app-builder-lib downloads for the installers', () => {
    const builder = createRequire(createRequire(import.meta.url).resolve('electron-builder/package.json'))
    const nsisChecksums = exportedObject(
      builder.resolve('app-builder-lib/out/toolsets/windows'),
      'nsisChecksums',
    ) as Record<string, Record<string, string>>
    const appimageChecksums = exportedObject(
      builder.resolve('app-builder-lib/out/toolsets/linux'),
      'appimageChecksums',
    ) as Record<string, Record<string, string>>
    const { nsis, appimage } = INSTALLER_TOOLSETS
    expect(nsisChecksums[nsis.version]).toEqual({ [nsis.file]: nsis.sha256 })
    expect(appimageChecksums[appimage.version]).toEqual({ [appimage.file]: appimage.sha256 })
  })

  it('describes the toolsets that electron-builder.ts selects', () => {
    expect(builderConfig.toolsets, 'Describe the new toolsets in INSTALLER_TOOLSETS and installerComponent').toEqual({
      nsis: INSTALLER_TOOLSETS.nsis.version,
      appimage: INSTALLER_TOOLSETS.appimage.version,
    })
  })

  it('describes the code that electron-builder puts in the installers', () => {
    const installer = installerComponent('26.17.0')
    expect(installer).toMatchObject({
      name: 'app-builder-lib',
      version: '26.17.0',
      purl: 'pkg:npm/app-builder-lib@26.17.0',
    })
    const parts = Object.fromEntries(installer.components!.map((part) => [part.name, part]))
    expect(parts['NSIS']).toMatchObject({
      version: '3.12',
      cpe: 'cpe:2.3:a:nullsoft:nullsoft_scriptable_install_system:3.12:*:*:*:*:*:*:*',
    })
    expect(parts['NSIS']!.description).toContain('nsExec, System of NSIS')
    expect(parts['NSIS']!.components!.map((plugin) => [plugin.name, plugin.version])).toEqual([
      ['nsis7z', '19.00'],
      ['SpiderBanner', undefined],
      ['StdUtils', '1.14'],
      ['WinShell', undefined],
    ])
    expect(parts['Elevate']).toMatchObject({ version: '1.3.0', authors: [{ name: 'Kai Liu' }] })
    expect(parts['AppImage runtime']).toMatchObject({
      version: '20251108',
      purl: 'pkg:github/AppImage/type2-runtime@20251108',
      hashes: [{ alg: 'SHA-256', content: APPIMAGE_RUNTIME_SHA256 }],
    })
    expect(parts['AppImage runtime']!.components!.map((library) => library.purl ?? library.name)).toEqual([
      'pkg:generic/libfuse@3.15.0',
      'pkg:generic/squashfuse@0.5.2',
      'pkg:generic/zstandard@1.5.6',
      'pkg:generic/zlib@1.3.1',
      'mimalloc',
      'musl',
    ])
    expect(parts['libXss']).toMatchObject({
      description: 'In usr/lib of the AppImage, as libXss.so.1.0.0.',
      hashes: [{ alg: 'SHA-256', content: APPIMAGE_LIBRARIES.find((file) => file.name.startsWith('libXss'))!.sha256 }],
    })
    expect(Object.keys(parts)).toEqual(
      expect.arrayContaining(['libappindicator3', 'libgconf-2', 'libindicator3', 'libnotify', 'libXss', 'libXtst']),
    )
  })

  it('describes an npm package from its package.json, with the hash from the lockfile', () => {
    const component = packageComponent(
      {
        name: '@scope/styles',
        version: '1.2.3',
        description: 'Styles',
        license: '(MIT OR Apache-2.0)',
        homepage: 'https://example.com',
        repository: { url: 'git+https://github.com/scope/styles.git' },
      },
      `sha512-${Buffer.from([1, 2, 255]).toString('base64')}`,
    )
    expect(component).toEqual({
      type: 'library',
      name: 'styles',
      group: '@scope',
      version: '1.2.3',
      'bom-ref': 'pkg:npm/%40scope/styles@1.2.3',
      purl: 'pkg:npm/%40scope/styles@1.2.3',
      description: 'Styles',
      licenses: [{ expression: '(MIT OR Apache-2.0)' }],
      externalReferences: [
        {
          type: 'distribution',
          url: 'https://registry.npmjs.org/@scope/styles/-/styles-1.2.3.tgz',
          hashes: [{ alg: 'SHA-512', content: '0102ff' }],
        },
        { type: 'website', url: 'https://example.com' },
        { type: 'vcs', url: 'https://github.com/scope/styles' },
      ],
    })
    expect(packageComponent({ name: 'shadcn', version: '4.22.0', license: 'MIT' }).licenses).toEqual([
      { license: { id: 'MIT' } },
    ])
  })

  it('has a source for each icon set in the data folder', () => {
    const files = readdirSync('src/canvas/icons/data')
      .filter((file) => file.endsWith('.json') && file !== 'templates.json')
      .map((file) => file.replace(/\.json$/, ''))
    expect(ICON_SOURCES.map((source) => source.file).toSorted()).toEqual(files.toSorted())
  })
})
