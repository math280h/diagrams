import type { IconLicense, IconSource } from './icons/sources.ts'
import { EMBEDDED_SOFTWARE } from './third-party-licenses.ts'

interface ExternalReference {
  type: string
  url: string
  hashes?: { alg: string; content: string }[]
}

type License = { license: { id: string } } | { license: { name: string; url?: string } } | { expression: string }

export interface Component {
  type: string
  name: string
  group?: string
  version?: string
  'bom-ref'?: string
  purl?: string
  cpe?: string
  copyright?: string
  licenses?: License[]
  hashes?: { alg: string; content: string }[]
  externalReferences?: ExternalReference[]
  components?: Component[]
  [field: string]: unknown
}

interface Part {
  name: string
  type?: 'library' | 'data'
  vendorProduct?: string
  npm?: boolean
}

const NODE_PARTS: Record<string, Part> = {
  acorn: { name: 'acorn', npm: true },
  ada: { name: 'Ada URL parser' },
  amaro: { name: 'amaro', npm: true },
  ares: { name: 'c-ares', vendorProduct: 'c-ares:c-ares' },
  brotli: { name: 'Brotli', vendorProduct: 'google:brotli' },
  cldr: { name: 'Unicode CLDR', type: 'data' },
  icu: { name: 'ICU', vendorProduct: 'icu-project:international_components_for_unicode' },
  llhttp: { name: 'llhttp', vendorProduct: 'llhttp:llhttp' },
  merve: { name: 'merve' },
  nbytes: { name: 'nbytes' },
  ncrypto: { name: 'ncrypto' },
  nghttp2: { name: 'nghttp2', vendorProduct: 'nghttp2:nghttp2' },
  nghttp3: { name: 'nghttp3', vendorProduct: 'ngtcp2:nghttp3' },
  ngtcp2: { name: 'ngtcp2', vendorProduct: 'ngtcp2:ngtcp2' },
  simdjson: { name: 'simdjson' },
  simdutf: { name: 'simdutf' },
  sqlite: { name: 'SQLite', vendorProduct: 'sqlite:sqlite' },
  tz: { name: 'IANA time zone database', type: 'data' },
  undici: { name: 'undici', npm: true, vendorProduct: 'nodejs:undici' },
  unicode: { name: 'Unicode Character Database', type: 'data' },
  uv: { name: 'libuv', vendorProduct: 'libuv:libuv' },
  uvwasi: { name: 'uvwasi' },
  zlib: { name: 'zlib', vendorProduct: 'zlib:zlib' },
  zstd: { name: 'Zstandard', vendorProduct: 'facebook:zstandard' },
}

// In process.versions, modules and napi are ABI numbers. Electron reports openssl as 0.0.0, because it uses the BoringSSL
// of Chromium.
const NOT_NODE_PARTS = new Set(['electron', 'chrome', 'v8', 'node', 'modules', 'napi', 'openssl'])

function cpe(vendorProduct: string, version: string, targetSoftware = '*'): string {
  return `cpe:2.3:a:${vendorProduct}:${version}:*:*:*:*:${targetSoftware}:*:*`
}

function part(key: string, version: string): Component {
  const known = NODE_PARTS[key] ?? { name: key }
  const purl = known.npm
    ? `pkg:npm/${known.name}@${version}`
    : `pkg:generic/${known.name.toLowerCase().replaceAll(' ', '-')}@${version}`
  return {
    type: known.type ?? 'library',
    name: known.name,
    version,
    purl,
    ...(known.vendorProduct && { cpe: cpe(known.vendorProduct, version) }),
  }
}

/**
 * Returns the component of a program that a package holds in compiled form, from {@link EMBEDDED_SOFTWARE}.
 *
 * @param holder - The name of the package that holds the program.
 */
export function embeddedComponent(holder: string, version: string): Component {
  const embedded = EMBEDDED_SOFTWARE[holder]!
  const product = embedded.name.toLowerCase()
  const purl = `pkg:generic/${product}@${version}`
  return {
    type: 'library',
    name: embedded.name,
    version,
    'bom-ref': purl,
    purl,
    cpe: cpe(`${product}:${product}`, version),
    licenses: [{ license: { id: embedded.license } }],
    externalReferences: [{ type: 'vcs', url: embedded.source }],
  }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith('#x') || code.startsWith('#X')) return String.fromCodePoint(Number.parseInt(code.slice(2), 16))
    if (code.startsWith('#')) return String.fromCodePoint(Number(code.slice(1)))
    return ENTITIES[code.toLowerCase()] ?? entity
  })
}

/**
 * Reads the projects that Chromium holds from the `LICENSES.chromium.html` file of Electron.
 *
 * @returns One component for each project, with its homepage. The file does not give versions.
 */
export function chromiumProjects(html: string): Component[] {
  const projects = new Map<string, Component>()
  for (const match of html.matchAll(
    /<span class="title">([^<]*)<\/span>\s*(?:<span class="homepage"><a href="([^"]*)")?/g,
  )) {
    const name = decodeEntities(match[1]!.trim())
    const homepage = decodeEntities(match[2] ?? '')
    const key = `${name}\n${homepage}`
    if (!name || projects.has(key)) continue
    projects.set(key, {
      type: 'library',
      name,
      ...(/^https?:\/\/\S+$/.test(homepage) && { externalReferences: [{ type: 'website', url: homepage }] }),
    })
  }
  return [...projects.values()]
}

/**
 * Returns the component of the Electron runtime, with Chromium, V8 and Node.js inside it, and the projects inside
 * Node.js.
 *
 * @param versions - The `process.versions` of the Electron binary.
 * @param chromium - The projects that Chromium holds, from {@link chromiumProjects}.
 */
export function electronComponent(versions: Readonly<Record<string, string>>, chromium: Component[]): Component {
  const electron = versions['electron']!
  const purl = `pkg:npm/electron@${electron}`
  const nodeParts = Object.entries(versions)
    .filter(([key, version]) => !NOT_NODE_PARTS.has(key) && version !== '' && version !== '0.0.0')
    .map(([key, version]) => part(key, version))
  return {
    type: 'framework',
    name: 'electron',
    version: electron,
    'bom-ref': purl,
    purl,
    cpe: cpe('electronjs:electron', electron, 'node.js'),
    licenses: [{ license: { id: 'MIT' } }],
    externalReferences: [{ type: 'vcs', url: 'https://github.com/electron/electron' }],
    components: [
      {
        type: 'library',
        name: 'Chromium',
        version: versions['chrome'],
        purl: `pkg:generic/chromium@${versions['chrome']}`,
        cpe: cpe('google:chrome', versions['chrome']!),
        licenses: [{ license: { id: 'BSD-3-Clause' } }],
        externalReferences: [{ type: 'website', url: 'https://www.chromium.org' }],
        components: chromium,
      },
      {
        type: 'library',
        name: 'V8',
        version: versions['v8'],
        purl: `pkg:generic/v8@${versions['v8']}`,
        cpe: cpe('google:v8', versions['v8']!),
        licenses: [{ license: { id: 'BSD-3-Clause' } }],
        externalReferences: [{ type: 'website', url: 'https://v8.dev' }],
      },
      {
        type: 'library',
        name: 'Node.js',
        version: versions['node'],
        purl: `pkg:github/nodejs/node@v${versions['node']}`,
        cpe: cpe('nodejs:node.js', versions['node']!),
        licenses: [{ license: { id: 'MIT' } }],
        externalReferences: [{ type: 'website', url: 'https://nodejs.org' }],
        components: nodeParts,
      },
    ],
  }
}

/** The fields of the `metadata.json` file of a Fontsource package that the SBOM uses. */
export interface FontMetadata {
  id: string
  family: string
  version: string
  source?: string
  license: { type: string; url?: string; attribution?: string }
}

/** Returns the component of the font that a Fontsource package holds. */
export function fontComponent(font: FontMetadata): Component {
  return {
    type: 'data',
    name: font.family,
    version: font.version,
    purl: `pkg:generic/${font.id}@${font.version}`,
    ...(font.license.attribution && { copyright: font.license.attribution }),
    licenses: [{ license: { id: font.license.type } }],
    ...(font.source && { externalReferences: [{ type: 'vcs', url: font.source }] }),
  }
}

function iconLicense(license: IconLicense): License {
  if ('id' in license) return { license: { id: license.id } }
  if ('expression' in license) return { expression: license.expression }
  return { license: { name: license.name, url: license.url } }
}

/** A Simple Icons logo with its own licence or terms. */
export interface LicensedLogo {
  title: string
  source: string
  license: { type: string; url?: string }
}

/**
 * Returns the component of an icon set that the app ships in `src/canvas/icons/data`.
 *
 * @param version - The version of the set, when the source names none, such as the version of an npm package.
 * @param sha256 - The hex SHA-256 of the data file of the set.
 * @param logos - The logos in the set that have their own licence or terms.
 */
export function iconSetComponent(
  source: IconSource,
  { version, sha256, logos = [] }: { version?: string; sha256: string; logos?: readonly LicensedLogo[] },
): Component {
  const setVersion = source.version ?? version
  const purl =
    source.purl ?? (source.npmPackage && setVersion ? `pkg:npm/${source.npmPackage}@${setVersion}` : undefined)
  return {
    type: 'data',
    name: source.name,
    ...(setVersion && { version: setVersion }),
    'bom-ref': `icons:${source.file}`,
    ...(purl && { purl }),
    licenses: [iconLicense(source.license)],
    hashes: [{ alg: 'SHA-256', content: sha256 }],
    externalReferences: [
      { type: 'website', url: source.website },
      ...source.downloads.map((url) => ({ type: 'distribution', url })),
    ],
    ...(logos.length > 0 && {
      components: logos.map((logo) => ({
        type: 'data',
        name: logo.title,
        licenses: [
          logo.license.type === 'custom'
            ? { license: { name: 'Custom terms of the owner', ...(logo.license.url && { url: logo.license.url }) } }
            : { license: { id: logo.license.type } },
        ],
        externalReferences: [{ type: 'website', url: logo.source }],
      })),
    }),
  }
}

const BUILDER_BINARIES = 'https://github.com/electron-userland/electron-builder-binaries/releases/download'

/**
 * The bundles of the default toolsets of electron-builder, from which the installers take code. A test compares the
 * names and SHA-256 checksums with app-builder-lib.
 */
export const INSTALLER_BUNDLES = {
  nsis: { name: 'nsis-3.0.4.1', sha256: '9877df902530f96357d13a7a31ae2b9df67f48b11ffc9a1700a7c961574ec5fa' },
  nsisResources: {
    name: 'nsis-resources-3.4.1',
    sha256: '593a9a92ef958321293ac6a2ee61e64bf1bd543142a5bd6b3d310709cc924103',
  },
  appImage: { name: 'appimage-12.0.1', sha256: 'd12ff7eb8f1d1ec4652ca5237a7fbdca33acc0c758045636feca62dc6ecb8ec4' },
} as const

const NSIS_PLUGINS = [
  'EmbedHTML',
  'INetC',
  'nsis7z',
  'nsisunz',
  'nsProcess',
  'SpiderBanner',
  'StdUtils',
  'UAC',
  'WinShell',
]
const APPIMAGE_LIBRARIES = [
  'libappindicator.so.1',
  'libgconf-2.so.4',
  'libindicator.so.7',
  'libnotify.so.4',
  'libXss.so.1',
  'libXtst.so.6',
]

function bundleReference(bundle: { name: string; sha256: string }) {
  return {
    type: 'distribution',
    url: `${BUILDER_BINARIES}/${bundle.name}/${bundle.name}.7z`,
    hashes: [{ alg: 'SHA-256', content: bundle.sha256 }],
  }
}

/**
 * Returns the component of electron-builder, with the code that it adds to the installers. That code is NSIS with its
 * plugins, Elevate, and the runtime and libraries of the AppImage.
 *
 * @param version - The version of app-builder-lib, the package of electron-builder that builds the installers.
 */
export function installerComponent(version: string): Component {
  const purl = `pkg:npm/app-builder-lib@${version}`
  const { nsis, nsisResources, appImage } = INSTALLER_BUNDLES
  return {
    type: 'application',
    name: 'app-builder-lib',
    version,
    'bom-ref': purl,
    purl,
    description:
      'The installer builder of electron-builder. Its installer scripts and the components inside it are in the ' +
      'installers, not in the app bundles.',
    licenses: [{ license: { id: 'MIT' } }],
    externalReferences: [{ type: 'vcs', url: 'https://github.com/electron-userland/electron-builder' }],
    components: [
      {
        type: 'application',
        name: 'NSIS',
        version: '3.04',
        purl: 'pkg:generic/nsis@3.04',
        cpe: cpe('nullsoft:nullsoft_scriptable_install_system', '3.04'),
        description: 'The code of the Windows installer, and of the uninstaller that it installs.',
        licenses: [{ license: { id: 'Zlib' } }],
        externalReferences: [{ type: 'website', url: 'https://nsis.sourceforge.io' }, bundleReference(nsis)],
        components: [
          {
            type: 'library',
            name: 'NSIS plugins of electron-builder',
            version: '3.4.1',
            description: 'The Windows installer holds the plugins that its script calls.',
            externalReferences: [bundleReference(nsisResources)],
            components: NSIS_PLUGINS.map((name) => ({ type: 'library', name })),
          },
        ],
      },
      {
        type: 'application',
        name: 'Elevate',
        version: '1.0.0.2894',
        authors: [{ name: 'Johannes Passing' }],
        description:
          'Installed with the app on Windows as resources\\elevate.exe. It starts the installer with administrator ' +
          'rights when needed.',
        externalReferences: [bundleReference(nsis)],
      },
      {
        type: 'application',
        name: 'AppImage runtime',
        version: 'effcebc',
        purl: 'pkg:github/AppImage/AppImageKit@effcebc',
        description: 'The start code of the AppImage. It loads libfuse2 and zlib from the system.',
        licenses: [{ license: { id: 'MIT' } }],
        externalReferences: [
          { type: 'vcs', url: 'https://github.com/AppImage/AppImageKit' },
          bundleReference(appImage),
        ],
        components: [
          { type: 'library', name: 'squashfuse', licenses: [{ license: { id: 'BSD-2-Clause' } }] },
          { type: 'library', name: 'liblzma' },
        ],
      },
      ...APPIMAGE_LIBRARIES.map((file) => ({
        type: 'library',
        name: file.replace(/\.so\.\d+$/, ''),
        description: `In usr/lib of the AppImage, as ${file}.`,
        externalReferences: [bundleReference(appImage)],
      })),
    ],
  }
}

/** The fields of a `package.json` file that {@link packageComponent} reads. */
export interface PackageManifest {
  name: string
  version: string
  description?: string
  license?: string
  homepage?: string
  repository?: string | { url?: string }
}

function packageLicense(license: string): License {
  return /^[\w.+-]+$/.test(license) ? { license: { id: license } } : { expression: license }
}

function repositoryUrl(repository: PackageManifest['repository']): string | undefined {
  const url = typeof repository === 'string' ? repository : repository?.url
  return url?.replace(/^git\+/, '').replace(/\.git$/, '')
}

/**
 * Returns the component of an npm package from its `package.json`, without its dependencies.
 *
 * @param integrity - The integrity of the package in `pnpm-lock.yaml`, such as `sha512-…`.
 */
export function packageComponent(manifest: PackageManifest, integrity?: string): Component {
  const [scope, name] = manifest.name.startsWith('@') ? manifest.name.split('/') : [undefined, manifest.name]
  const purl = `pkg:npm/${scope ? `${encodeURIComponent(scope)}/` : ''}${name}@${manifest.version}`
  const sha512 = integrity?.startsWith('sha512-')
    ? Buffer.from(integrity.slice('sha512-'.length), 'base64').toString('hex')
    : undefined
  const vcs = repositoryUrl(manifest.repository)
  return {
    type: 'library',
    name,
    ...(scope && { group: scope }),
    version: manifest.version,
    'bom-ref': purl,
    purl,
    ...(manifest.description && { description: manifest.description }),
    ...(manifest.license && { licenses: [packageLicense(manifest.license)] }),
    externalReferences: [
      {
        type: 'distribution',
        url: `https://registry.npmjs.org/${manifest.name}/-/${name}-${manifest.version}.tgz`,
        ...(sha512 && { hashes: [{ alg: 'SHA-512', content: sha512 }] }),
      },
      ...(manifest.homepage ? [{ type: 'website', url: manifest.homepage }] : []),
      ...(vcs && /^https?:\/\//.test(vcs) ? [{ type: 'vcs', url: vcs }] : []),
    ],
  }
}
