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

const NSIS_DOWNLOADS = 'https://sourceforge.net/projects/nsis/files/NSIS%203/3.12'
const TYPE2_RUNTIME = 'https://github.com/AppImage/type2-runtime'

/**
 * The toolsets that `electron-builder.ts` selects, with the bundle that app-builder-lib downloads for each one. The
 * installers take code from these bundles. A test compares them with the configuration and with app-builder-lib.
 */
export const INSTALLER_TOOLSETS = {
  nsis: {
    version: '1.2.1',
    file: 'nsis-bundle-3.12.tar.gz',
    sha256: '56997fdefe25e7928a1a68b4583d08b240b66cf660234053b20131a74cc082f4',
  },
  appimage: {
    version: '1.0.3',
    file: 'appimage-tools-runtime-20251108.tar.gz',
    sha256: '84021a78ee214ae6fd33a2d62a92ba25542dd10bc86bf117a9b2d0bba44e7665',
  },
} as const

/** A file that electron-builder copies from a toolset bundle into an installer. */
export interface InstallerFile {
  name: string
  sha256: string
}

interface NsisPlugin extends InstallerFile {
  version?: string
  license?: License
  source: string
}

/**
 * The plugins from outside NSIS that the Windows installer or uninstaller holds in `$PLUGINSDIR`. `sha256` is the hash
 * of the DLL in `windows/Plugins/x86-unicode` of the NSIS bundle. CI compares this list with the built installers.
 */
export const NSIS_PLUGINS: readonly NsisPlugin[] = [
  {
    name: 'nsis7z',
    version: '19.00',
    sha256: 'b393f05e8ff919ef071181050e1873c9a776e1a0ae8329aefff7007d0cadf592',
    license: { license: { name: 'Public domain (LZMA SDK)' } },
    source: 'https://nsis.sourceforge.io/mediawiki/images/6/69/Nsis7z_19.00.7z',
  },
  {
    name: 'SpiderBanner',
    sha256: '996a259e53ca18b89ec36d038c40148957c978c0fd600a268497d4c92f882a93',
    source: 'https://nsis.sourceforge.io/mediawiki/images/4/4c/SpiderBanner_plugin.zip',
  },
  {
    name: 'StdUtils',
    version: '1.14',
    sha256: 'b72e9013a6204e9f01076dc38dabbf30870d44dfc66962adbf73619d4331601e',
    license: { license: { id: 'LGPL-2.1-or-later' } },
    source: 'https://github.com/lordmulder/stdutils/releases/download/1.14/StdUtils.2018-10-27.zip',
  },
  {
    name: 'WinShell',
    sha256: '9be85b986ea66a6997dde658abe82b3147ed2a1a3dcb784bb5176f41d22815a6',
    source: 'https://nsis.sourceforge.io/mediawiki/images/5/54/WinShell.zip',
  },
]

/** The plugins of NSIS that the Windows installer or uninstaller holds. The NSIS component includes them. */
export const NSIS_OWN_PLUGINS: readonly string[] = ['nsExec', 'System']

/** The SHA-256 of `runtimes/runtime-x64` of the AppImage bundle, which starts the AppImage. */
export const APPIMAGE_RUNTIME_SHA256 = '2fca8b443c92510f1483a883f60061ad09b46b978b2631c807cd873a47ec260d'

/** The libraries that electron-builder copies from `lib/x64` of the AppImage bundle to `usr/lib` of the AppImage. */
export const APPIMAGE_LIBRARIES: readonly InstallerFile[] = [
  { name: 'libappindicator3.so.1.0.0', sha256: 'e986459b76c7592b6ee5a27a3ed1bae6aded0c677e9d6efc52d34499006e7fde' },
  { name: 'libgconf-2.so.4.1.5', sha256: 'ad8ca9b6042cb2790ea143451e1f166fb4806aef2dd96fba00b20e37a32abf35' },
  { name: 'libindicator3.so.7.0.0', sha256: '9ef1b4287cbf444af16f3e3da4fa97b6305a0329f457fb25b1ae6a6fd271baea' },
  { name: 'libnotify.so.4.0.0', sha256: '980f4f40c18f122a5e560fb41147ccc1bcd13992a2bbf26b11c4ecb8081c0fd3' },
  { name: 'libXss.so.1.0.0', sha256: '270fe6e4d430118793d01cac5c6081d0ea9e244cfcf510475bc779bef21b754a' },
  { name: 'libXtst.so.6.1.0', sha256: 'a3343e51790f219fbb3cb48bc1ba267b4727d9e9277e43cdfc081deb14d910b2' },
]

function sha256Hash(content: string) {
  return { alg: 'SHA-256', content }
}

function download(url: string, sha256?: string): ExternalReference {
  return { type: 'distribution', url, ...(sha256 && { hashes: [sha256Hash(sha256)] }) }
}

function toolsetReference(toolset: keyof typeof INSTALLER_TOOLSETS): ExternalReference {
  const { version, file, sha256 } = INSTALLER_TOOLSETS[toolset]
  return download(`${BUILDER_BINARIES}/${toolset}@${version}/${file}`, sha256)
}

function runtimeLibrary(
  name: string,
  version: string | undefined,
  license: License,
  details: Partial<Component> = {},
): Component {
  return {
    type: 'library',
    name,
    ...(version && { version, purl: `pkg:generic/${name.toLowerCase()}@${version}` }),
    licenses: [license],
    ...details,
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
        version: '3.12',
        purl: 'pkg:generic/nsis@3.12',
        cpe: cpe('nullsoft:nullsoft_scriptable_install_system', '3.12'),
        description:
          'The code of the Windows installer, and of the uninstaller that it installs, from the strlen_8192 build ' +
          'of NSIS. The installer and the uninstaller hold the plugins that their scripts call: ' +
          `${NSIS_OWN_PLUGINS.join(', ')} of NSIS, and the plugins below.`,
        licenses: [{ license: { id: 'Zlib' } }],
        externalReferences: [
          { type: 'website', url: 'https://nsis.sourceforge.io' },
          download(
            `${NSIS_DOWNLOADS}/nsis-3.12.zip/download`,
            '56581f90db321581c5381193d796fffcf2d24b2f8fed2160a6c6a3baa67f2c4f',
          ),
          download(
            `${NSIS_DOWNLOADS}/nsis-3.12-strlen_8192.zip/download`,
            '44ebb4bfd5b763e295855718dbcf374fc396d03870ea038a0844abcbe1ff0c3a',
          ),
          toolsetReference('nsis'),
        ],
        components: NSIS_PLUGINS.map((plugin) => ({
          type: 'library',
          name: plugin.name,
          ...(plugin.version && { version: plugin.version }),
          ...(plugin.license && { licenses: [plugin.license] }),
          hashes: [sha256Hash(plugin.sha256)],
          externalReferences: [download(plugin.source)],
        })),
      },
      {
        type: 'application',
        name: 'Elevate',
        version: '1.3.0',
        authors: [{ name: 'Kai Liu' }],
        description:
          'Installed with the app on Windows as resources\\elevate.exe. It starts the installer with administrator ' +
          'rights when needed. electron-builder compiles it from the source archive, which states no licence.',
        externalReferences: [
          { type: 'website', url: 'https://code.kliu.org/misc/elevate/' },
          download(
            'https://code.kliu.org/misc/elevate/elevate-1.3.0-redist.7z',
            'b1b3f070353a0eadee2cea3a575049d10df9763ff24e39313da4cec9455382e1',
          ),
          toolsetReference('nsis'),
        ],
      },
      {
        type: 'application',
        name: 'AppImage runtime',
        version: '20251108',
        purl: 'pkg:github/AppImage/type2-runtime@20251108',
        description:
          'The start code of the AppImage, from commit dd6cebe. It is linked statically and needs no libraries ' +
          'from the system. It mounts the AppImage with fusermount3 or fusermount of the system.',
        licenses: [{ license: { id: 'MIT' } }],
        hashes: [sha256Hash(APPIMAGE_RUNTIME_SHA256)],
        externalReferences: [
          { type: 'vcs', url: TYPE2_RUNTIME },
          download(`${TYPE2_RUNTIME}/releases/download/20251108/runtime-x86_64`, APPIMAGE_RUNTIME_SHA256),
          toolsetReference('appimage'),
        ],
        components: [
          runtimeLibrary(
            'libfuse',
            '3.15.0',
            { license: { id: 'LGPL-2.1-only' } },
            {
              cpe: cpe('libfuse_project:libfuse', '3.15.0'),
              description: 'With the patch of type2-runtime for lib/mount.c.',
              externalReferences: [
                download(
                  'https://github.com/libfuse/libfuse/releases/download/fuse-3.15.0/fuse-3.15.0.tar.xz',
                  '70589cfd5e1cff7ccd6ac91c86c01be340b227285c5e200baa284e401eea2ca0',
                ),
              ],
            },
          ),
          runtimeLibrary(
            'squashfuse',
            '0.5.2',
            { license: { id: 'BSD-2-Clause' } },
            {
              externalReferences: [
                download(
                  'https://github.com/vasi/squashfuse/archive/0.5.2.tar.gz',
                  'db0238c5981dabbd80ee09ae15387f390091668ca060a7bc38047912491443d3',
                ),
              ],
            },
          ),
          runtimeLibrary(
            'Zstandard',
            '1.5.6',
            { expression: 'BSD-3-Clause OR GPL-2.0-only' },
            {
              cpe: cpe('facebook:zstandard', '1.5.6'),
            },
          ),
          runtimeLibrary('zlib', '1.3.1', { license: { id: 'Zlib' } }, { cpe: cpe('zlib:zlib', '1.3.1') }),
          runtimeLibrary('mimalloc', undefined, { license: { id: 'MIT' } }),
          runtimeLibrary(
            'musl',
            undefined,
            { license: { id: 'MIT' } },
            {
              description: 'The C library of Alpine Linux 3.21.',
            },
          ),
        ],
      },
      ...APPIMAGE_LIBRARIES.map((library) => ({
        type: 'library',
        name: library.name.replace(/\.so(\.\d+)*$/, ''),
        description: `In usr/lib of the AppImage, as ${library.name}.`,
        hashes: [sha256Hash(library.sha256)],
        externalReferences: [toolsetReference('appimage')],
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
