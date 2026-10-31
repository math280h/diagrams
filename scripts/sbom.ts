import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { REPOSITORY_URL, WEBSITE_ORIGIN } from '../src/desktop/constants.ts'
import { type BundledSoftware, EMBEDDED_SOFTWARE, readNoticeText } from './third-party-licenses.ts'

interface ExternalReference {
  type: string
  url: string
}

export interface Component {
  type: string
  name: string
  group?: string
  version?: string
  'bom-ref'?: string
  purl?: string
  cpe?: string
  licenses?: { license: { id: string } }[]
  externalReferences?: ExternalReference[]
  components?: Component[]
  [field: string]: unknown
}

export interface Bom {
  metadata: { component: Component; [field: string]: unknown }
  components: Component[]
  dependencies: { ref: string; dependsOn?: string[] }[]
  [field: string]: unknown
}

/** The facts about a desktop release that the output of `pnpm sbom` does not hold. */
export interface Release {
  /** The app version, such as `0.2.0` or `0.2.1-preview.57`. */
  version: string
  /** The git tag of the build, which the purl of the app names. */
  tag: string
  electronVersion: string
  /** The packages and the programs inside packages in the licence files of the bundles. */
  bundled: readonly BundledSoftware[]
  /** The version of each program inside a package, by `<package>@<package version>`. */
  embeddedVersions: Readonly<Record<string, string>>
}

const LICENCE_FILES = [
  'dist/third-party-licenses.txt',
  'dist/standalone/licenses.txt',
  'dist-electron/third-party-licenses.main.txt',
]

function packageName(component: Component): string {
  return component.group ? `${component.group}/${component.name}` : component.name
}

function embeddedComponent(holder: string, version: string): Component {
  const embedded = EMBEDDED_SOFTWARE[holder]!
  const product = embedded.name.toLowerCase()
  const purl = `pkg:generic/${product}@${version}`
  return {
    type: 'library',
    name: embedded.name,
    version,
    'bom-ref': purl,
    purl,
    cpe: `cpe:2.3:a:${product}:${product}:${version}:*:*:*:*:*:*:*`,
    licenses: [{ license: { id: embedded.license } }],
    externalReferences: [{ type: 'vcs', url: embedded.source }],
  }
}

function electronComponent(version: string): Component {
  const purl = `pkg:npm/electron@${version}`
  return {
    type: 'framework',
    name: 'electron',
    version,
    'bom-ref': purl,
    purl,
    cpe: `cpe:2.3:a:electronjs:electron:${version}:*:*:*:*:node.js:*:*`,
    licenses: [{ license: { id: 'MIT' } }],
    externalReferences: [{ type: 'vcs', url: 'https://github.com/electron/electron' }],
  }
}

function embeddedComponents(bundled: readonly BundledSoftware[], versions: Release['embeddedVersions']) {
  const byHolder = new Map<string, Component[]>()
  for (const software of bundled) {
    if (!('holder' in software)) continue
    const holder = `${software.holder.name}@${software.holder.version}`
    const version = versions[holder]
    if (!version) throw new Error(`The release has no version for ${software.name} in ${holder}.`)
    const components = byHolder.get(holder) ?? []
    if (!components.some((component) => component.name === software.name)) {
      byHolder.set(holder, [...components, embeddedComponent(software.holder.name, version)])
    }
  }
  return byHolder
}

/**
 * Turns the production SBOM of `pnpm sbom` into the SBOM of a desktop release.
 *
 * The root component becomes the app at the release version, with a `pkg:github` purl in place of the npm purl of the
 * private package. The Electron runtime becomes a dependency of the app, and each program inside a bundled package
 * becomes a component inside that package.
 *
 * @throws Error If a bundled package is not in the SBOM of pnpm, or a program inside a package has no version.
 */
export function releaseSbom(bom: Bom, release: Release): Bom {
  const listed = new Set(bom.components.map((component) => `${packageName(component)}@${component.version}`))
  const missing = release.bundled.flatMap((software) =>
    'version' in software && !listed.has(`${software.name}@${software.version}`)
      ? [`${software.name}@${software.version}`]
      : [],
  )
  if (missing.length > 0) {
    throw new Error(
      `The bundles hold packages that the SBOM of pnpm does not list: ${missing.join(', ')}. ` +
        'Make each one a production dependency in package.json.',
    )
  }
  const embedded = embeddedComponents(release.bundled, release.embeddedVersions)
  const oldRootRef = bom.metadata.component['bom-ref']
  const rootRef = `pkg:github/${new URL(REPOSITORY_URL).pathname.slice(1)}@${release.tag}`
  const electron = electronComponent(release.electronVersion)
  const components = bom.components.map((component) => {
    const inside = embedded.get(`${packageName(component)}@${component.version}`)
    return inside ? { ...component, components: [...(component.components ?? []), ...inside] } : component
  })
  return {
    ...bom,
    metadata: {
      ...bom.metadata,
      component: {
        ...bom.metadata.component,
        name: 'Diagrams',
        version: release.version,
        'bom-ref': rootRef,
        purl: rootRef,
        externalReferences: [
          { type: 'vcs', url: REPOSITORY_URL },
          { type: 'website', url: WEBSITE_ORIGIN },
          { type: 'issue-tracker', url: `${REPOSITORY_URL}/issues` },
        ],
      },
    },
    components: [...components, electron],
    dependencies: [
      ...bom.dependencies.map((dependency) =>
        dependency.ref === oldRootRef
          ? { ref: rootRef, dependsOn: [...(dependency.dependsOn ?? []), electron['bom-ref']!] }
          : dependency,
      ),
      { ref: electron['bom-ref']!, dependsOn: [] },
    ],
  }
}

async function graphvizVersion(): Promise<string> {
  const { Graphviz } = await import('@hpcc-js/wasm-graphviz')
  return (await Graphviz.load()).version()
}

async function llhttpVersion(undiciVersion: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/nodejs/undici/v${undiciVersion}/deps/llhttp/include/llhttp.h`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} answered with status ${response.status}.`)
  const header = await response.text()
  const parts = ['MAJOR', 'MINOR', 'PATCH'].map(
    (part) => header.match(new RegExp(`#define LLHTTP_VERSION_${part} (\\d+)`))?.[1],
  )
  if (parts.some((part) => part === undefined)) throw new Error(`${url} has no llhttp version.`)
  return parts.join('.')
}

/** Finds the version of the program in each package of {@link EMBEDDED_SOFTWARE}, from the version of the package. */
export const EMBEDDED_VERSIONS: Record<string, (holderVersion: string) => Promise<string>> = {
  '@hpcc-js/wasm-graphviz': graphvizVersion,
  undici: llhttpVersion,
}

async function main() {
  const [input, version, tag, output] = process.argv.slice(2)
  if (!input || !version || !tag || !output) {
    throw new Error('Usage: node scripts/sbom.ts <pnpm sbom file> <version> <tag> <output file>')
  }
  const absent = LICENCE_FILES.filter((file) => !existsSync(file))
  if (absent.length > 0) throw new Error(`Run pnpm desktop:build first. These files are missing: ${absent.join(', ')}.`)
  const bundled = LICENCE_FILES.flatMap((file) => readNoticeText(readFileSync(file, 'utf8')))
  const holders = new Map(
    bundled.flatMap((software) =>
      'holder' in software ? [[`${software.holder.name}@${software.holder.version}`, software.holder] as const] : [],
    ),
  )
  const embeddedVersions: Record<string, string> = {}
  for (const [key, holder] of holders) {
    const findVersion = EMBEDDED_VERSIONS[holder.name]
    if (!findVersion) throw new Error(`EMBEDDED_VERSIONS in scripts/sbom.ts has no entry for ${holder.name}.`)
    embeddedVersions[key] = await findVersion(holder.version)
  }
  const electron = JSON.parse(readFileSync('node_modules/electron/package.json', 'utf8')) as { version: string }
  const bom = JSON.parse(readFileSync(input, 'utf8')) as Bom
  const release = { version, tag, electronVersion: electron.version, bundled, embeddedVersions }
  writeFileSync(output, `${JSON.stringify(releaseSbom(bom, release), null, 2)}\n`)
}

if (import.meta.main) await main()
