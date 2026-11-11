import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import * as simpleIcons from 'simple-icons'
import type { SimpleIcon } from 'simple-icons'
import { OFFICIAL_WEBSITE } from '../src/desktop/build-config.ts'
import { REPOSITORY_URL } from '../src/desktop/constants.ts'
import { ICON_SOURCES } from './icons/sources.ts'
import {
  chromiumProjects,
  type Component,
  electronComponent,
  embeddedComponent,
  type FontMetadata,
  fontComponent,
  iconSetComponent,
  installerComponent,
  type PackageManifest,
  packageComponent,
  type LicensedLogo,
} from './sbom-components.ts'
import { type BundledSoftware, readNoticeText } from './third-party-licenses.ts'

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
  /** The packages and the programs inside packages in the licence files of the bundles. */
  bundled: readonly BundledSoftware[]
  /** The components inside packages of the SBOM of pnpm, such as programs and fonts, by `<package>@<version>`. */
  inside: Readonly<Record<string, readonly Component[]>>
  /** Electron, with the projects inside it. */
  runtime: Component
  /** electron-builder, with the code that it puts in the installers. */
  installer: Component
  /** The data that the app ships outside packages, such as icon sets. */
  data: readonly Component[]
  /** The bundled packages that the SBOM of pnpm does not list, such as dev dependencies whose CSS ships. */
  unlisted: readonly Component[]
}

const LICENCE_FILES = [
  'dist/third-party-licenses.txt',
  'dist/standalone/licenses.txt',
  'dist-electron/third-party-licenses.main.txt',
]
const ICON_DATA = 'src/canvas/icons/data'

function packageName(component: Component): string {
  return component.group ? `${component.group}/${component.name}` : component.name
}

/** Returns the `<package>@<version>` key of each component of an SBOM. */
export function listedPackages(bom: Bom): Set<string> {
  return new Set(bom.components.map((component) => `${packageName(component)}@${component.version}`))
}

/** The parts that {@link composeSbom} adds to the production SBOM of `pnpm sbom`. */
export interface Additions {
  /** The packages and the programs inside packages in the licence files of the bundles. */
  bundled: readonly BundledSoftware[]
  /** The components inside packages of the SBOM of pnpm, such as programs and fonts, by `<package>@<version>`. */
  inside: Readonly<Record<string, readonly Component[]>>
  /** The bundled packages that the SBOM of pnpm does not list, such as dev dependencies whose CSS ships. */
  unlisted: readonly Component[]
  /** The other components that the root depends on, such as a runtime or data. */
  extra: readonly Component[]
  /** The root component, which replaces the private package of the SBOM of pnpm. */
  root: Component
}

/**
 * Adds the bundled software, the extra components and a new root to the production SBOM of `pnpm sbom`.
 *
 * Each component in `additions.inside` goes inside its package. The unlisted packages and the extra components become
 * dependencies of the root.
 *
 * @throws Error If a bundled package, or a program inside a bundled package, has no component.
 */
export function composeSbom(bom: Bom, additions: Additions): Bom {
  const listed = listedPackages(bom)
  const unlisted = new Set(additions.unlisted.map((component) => `${packageName(component)}@${component.version}`))
  const missing = additions.bundled.flatMap((software) => {
    if (!('version' in software)) return []
    const key = `${software.name}@${software.version}`
    return listed.has(key) || unlisted.has(key) ? [] : [key]
  })
  if (missing.length > 0) {
    throw new Error(`The SBOM has no component for these bundled packages: ${missing.join(', ')}.`)
  }
  for (const software of additions.bundled) {
    if (!('holder' in software)) continue
    const holder = `${software.holder.name}@${software.holder.version}`
    if (!additions.inside[holder]?.some((component) => component.name === software.name)) {
      throw new Error(`The SBOM has no component for ${software.name} in ${holder}.`)
    }
  }
  const oldRootRef = bom.metadata.component['bom-ref']
  const rootRef = additions.root['bom-ref']!
  const added = [...additions.unlisted, ...additions.extra]
  const components = bom.components.map((component) => {
    const inside = additions.inside[`${packageName(component)}@${component.version}`]
    return inside ? { ...component, components: [...(component.components ?? []), ...inside] } : component
  })
  return {
    ...bom,
    metadata: { ...bom.metadata, component: additions.root },
    components: [...components, ...added],
    dependencies: [
      ...bom.dependencies.map((dependency) =>
        dependency.ref === oldRootRef
          ? { ref: rootRef, dependsOn: [...(dependency.dependsOn ?? []), ...added.map((one) => one['bom-ref']!)] }
          : dependency,
      ),
      ...added.map((one) => ({ ref: one['bom-ref']!, dependsOn: [] })),
    ],
  }
}

/**
 * Turns the production SBOM of `pnpm sbom` into the SBOM of a desktop release.
 *
 * The root component becomes the app at the release version, with a `pkg:github` purl in place of the npm purl of the
 * private package. Electron, the installer builder, the data and the unlisted packages become dependencies of the app.
 *
 * @throws Error If a bundled package, or a program inside a bundled package, has no component.
 */
export function releaseSbom(bom: Bom, release: Release): Bom {
  const rootRef = `pkg:github/${new URL(REPOSITORY_URL).pathname.slice(1)}@${release.tag}`
  return composeSbom(bom, {
    ...release,
    extra: [release.runtime, release.installer, ...release.data],
    root: {
      ...bom.metadata.component,
      name: 'Diagrams',
      version: release.version,
      'bom-ref': rootRef,
      purl: rootRef,
      externalReferences: [
        { type: 'vcs', url: REPOSITORY_URL },
        { type: 'website', url: OFFICIAL_WEBSITE },
        { type: 'issue-tracker', url: `${REPOSITORY_URL}/issues` },
      ],
    },
  })
}

/**
 * Keeps only the packages of the SBOM of pnpm that the bundles hold, and the dependencies between them.
 *
 * A kept package that the root no longer reaches becomes a direct dependency of the root.
 */
export function bundledOnly(bom: Bom, bundled: readonly BundledSoftware[]): Bom {
  const keys = new Set(
    bundled.flatMap((software) => ('version' in software ? [`${software.name}@${software.version}`] : [])),
  )
  const components = bom.components.filter((component) => keys.has(`${packageName(component)}@${component.version}`))
  const refs = new Set(components.map((component) => component['bom-ref']!))
  const rootRef = bom.metadata.component['bom-ref']!
  const dependsOn = new Map(
    bom.dependencies
      .filter((dependency) => dependency.ref === rootRef || refs.has(dependency.ref))
      .map((dependency) => [dependency.ref, (dependency.dependsOn ?? []).filter((ref) => refs.has(ref))]),
  )
  const reached = new Set<string>()
  const queue = [...(dependsOn.get(rootRef) ?? [])]
  for (let ref = queue.pop(); ref !== undefined; ref = queue.pop()) {
    if (reached.has(ref)) continue
    reached.add(ref)
    queue.push(...(dependsOn.get(ref) ?? []))
  }
  const unreached = components.map((component) => component['bom-ref']!).filter((ref) => !reached.has(ref))
  dependsOn.set(rootRef, [...(dependsOn.get(rootRef) ?? []), ...unreached])
  return {
    ...bom,
    components,
    dependencies: [...dependsOn].map(([ref, refsOfDependency]) => ({ ref, dependsOn: refsOfDependency })),
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

/**
 * Finds the version of the program in each package of `EMBEDDED_SOFTWARE` in `scripts/third-party-licenses.ts`, from
 * the version of the package.
 */
export const EMBEDDED_VERSIONS: Record<string, (holderVersion: string) => Promise<string>> = {
  '@hpcc-js/wasm-graphviz': graphvizVersion,
  undici: llhttpVersion,
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'))
}

/** Returns the components of the programs inside bundled packages, by `<package>@<version>`. */
export async function programsInside(bundled: readonly BundledSoftware[]): Promise<Record<string, Component[]>> {
  const inside: Record<string, Component[]> = {}
  for (const software of bundled) {
    if (!('holder' in software)) continue
    const key = `${software.holder.name}@${software.holder.version}`
    if (inside[key]?.some((component) => component.name === software.name)) continue
    const findVersion = EMBEDDED_VERSIONS[software.holder.name]
    if (!findVersion) throw new Error(`EMBEDDED_VERSIONS in scripts/sbom.ts has no entry for ${software.holder.name}.`)
    const component = embeddedComponent(software.holder.name, await findVersion(software.holder.version))
    inside[key] = [...(inside[key] ?? []), component]
  }
  return inside
}

/** Returns the font components inside the `@fontsource` packages of `components`, by `<package>@<version>`. */
export function fontsInside(components: readonly Component[]): Record<string, Component[]> {
  const inside: Record<string, Component[]> = {}
  for (const component of components) {
    if (!component.group?.startsWith('@fontsource')) continue
    const name = packageName(component)
    const installed = readJson(`node_modules/${name}/package.json`) as { version: string }
    if (installed.version !== component.version) {
      throw new Error(`node_modules holds ${name} ${installed.version}, but the SBOM lists ${component.version}.`)
    }
    inside[`${name}@${component.version}`] = [
      fontComponent(readJson(`node_modules/${name}/metadata.json`) as FontMetadata),
    ]
  }
  return inside
}

function lockfileIntegrity(lockfile: string, name: string, version: string): string | undefined {
  const key = name.startsWith('@') ? `'${name}@${version}'` : `${name}@${version}`
  const start = lockfile.indexOf(`\n  ${key}:\n`)
  if (start === -1) return undefined
  return lockfile.slice(start, start + 400).match(/integrity: (sha512-[A-Za-z0-9+/=]+)/)?.[1]
}

/**
 * Returns the components of the bundled packages, from `node_modules` and the integrity in `pnpm-lock.yaml`.
 *
 * @param listed - The `<package>@<version>` keys to leave out.
 * @throws Error If `node_modules` holds a different version of a bundled package.
 */
export function bundledPackages(
  bundled: readonly BundledSoftware[],
  listed: ReadonlySet<string> = new Set(),
): Component[] {
  const lockfile = readFileSync('pnpm-lock.yaml', 'utf8')
  const packages = new Map<string, Component>()
  for (const software of bundled) {
    if (!('version' in software) || listed.has(`${software.name}@${software.version}`)) continue
    const manifest = readJson(`node_modules/${software.name}/package.json`) as PackageManifest
    if (manifest.version !== software.version) {
      throw new Error(
        `node_modules holds ${software.name} ${manifest.version}, but the bundles hold ${software.version}.`,
      )
    }
    const integrity = lockfileIntegrity(lockfile, software.name, software.version)
    packages.set(`${software.name}@${software.version}`, packageComponent(manifest, integrity))
  }
  return [...packages.values()]
}

function electronRuntime(): Component {
  const binary = createRequire(import.meta.url)('electron') as string
  const versions = JSON.parse(
    execFileSync(binary, ['-p', 'JSON.stringify(process.versions)'], {
      encoding: 'utf8',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    }),
  ) as Record<string, string>
  const licences = path.join(path.dirname(binary), 'LICENSES.chromium.html')
  const chromium = existsSync(licences) ? chromiumProjects(readFileSync(licences, 'utf8')) : []
  if (chromium.length === 0) throw new Error(`${licences} names no projects.`)
  return electronComponent(versions, chromium)
}

/** Returns the components of the icon sets in `src/canvas/icons/data`, with the licensed logos. */
export function iconSets(): Component[] {
  const icons = new Map(
    Object.values(simpleIcons)
      .filter((icon): icon is SimpleIcon => typeof icon === 'object' && 'slug' in icon)
      .map((icon) => [`logo:${icon.slug}`, icon]),
  )
  return ICON_SOURCES.map((source) => {
    const file = path.join(ICON_DATA, `${source.file}.json`)
    const data = readFileSync(file)
    const sha256 = createHash('sha256').update(data).digest('hex')
    const version = source.npmPackage
      ? (readJson(`node_modules/${source.npmPackage}/package.json`) as { version: string }).version
      : undefined
    const logos =
      source.file === 'logos'
        ? (JSON.parse(data.toString('utf8')) as { entries: { id: string }[] }).entries.flatMap(
            (entry): LicensedLogo[] => {
              const icon = icons.get(entry.id)
              return icon?.license ? [{ title: icon.title, source: icon.source, license: icon.license }] : []
            },
          )
        : []
    return iconSetComponent(source, { version, sha256, logos })
  })
}

async function main() {
  const [input, version, tag, output] = process.argv.slice(2)
  if (!input || !version || !tag || !output) {
    throw new Error('Usage: node scripts/sbom.ts <pnpm sbom file> <version> <tag> <output file>')
  }
  const absent = LICENCE_FILES.filter((file) => !existsSync(file))
  if (absent.length > 0) throw new Error(`Run pnpm desktop:build first. These files are missing: ${absent.join(', ')}.`)
  const bundled = LICENCE_FILES.flatMap((file) => readNoticeText(readFileSync(file, 'utf8')))
  const bom = readJson(input) as Bom
  const inside = { ...(await programsInside(bundled)) }
  for (const [key, components] of Object.entries(fontsInside(bom.components)))
    inside[key] = [...(inside[key] ?? []), ...components]
  const builder = createRequire(createRequire(import.meta.url).resolve('electron-builder/package.json'))
  const installer = installerComponent((builder('app-builder-lib/package.json') as { version: string }).version)
  const unlisted = bundledPackages(bundled, listedPackages(bom))
  const release = { version, tag, bundled, inside, runtime: electronRuntime(), installer, data: iconSets(), unlisted }
  writeFileSync(output, `${JSON.stringify(releaseSbom(bom, release), null, 2)}\n`)
}

if (import.meta.main) await main()
