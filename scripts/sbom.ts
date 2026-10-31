import { readFileSync, writeFileSync } from 'node:fs'
import { REPOSITORY_URL, WEBSITE_ORIGIN } from '../src/desktop/constants.ts'
import { EMBEDDED_SOFTWARE } from './third-party-licenses.ts'

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

/** The versions of the software that `pnpm sbom` does not list: the Electron runtime and the programs inside packages. */
export interface RuntimeVersions {
  electron: string
  /** The version of each program in {@link EMBEDDED_SOFTWARE}, by the name of the package that holds it. */
  embedded: Record<string, string>
}

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

/**
 * Turns the production SBOM of `pnpm sbom` into the SBOM of a desktop release.
 *
 * The root component becomes the app at the release version, with a `pkg:github` purl in place of the npm purl of the
 * private package. The Electron runtime becomes a dependency of the app, and each program in
 * {@link EMBEDDED_SOFTWARE} becomes a component inside the package that holds it.
 *
 * @param release - The app version, and the git tag that the purl of the app names.
 */
export function releaseSbom(bom: Bom, release: { version: string; tag: string }, runtime: RuntimeVersions): Bom {
  const { version, tag } = release
  const oldRootRef = bom.metadata.component['bom-ref']
  const repository = new URL(REPOSITORY_URL).pathname.slice(1)
  const rootRef = `pkg:github/${repository}@${tag}`
  const electron = electronComponent(runtime.electron)
  const components = bom.components.map((component) => {
    const name = packageName(component)
    const embeddedVersion = runtime.embedded[name]
    if (!EMBEDDED_SOFTWARE[name] || embeddedVersion === undefined) return component
    return { ...component, components: [...(component.components ?? []), embeddedComponent(name, embeddedVersion)] }
  })
  return {
    ...bom,
    metadata: {
      ...bom.metadata,
      component: {
        ...bom.metadata.component,
        name: 'Diagrams',
        version,
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

async function main() {
  const [input, version, tag, output] = process.argv.slice(2)
  if (!input || !version || !tag || !output) {
    throw new Error('Usage: node scripts/sbom.ts <pnpm sbom file> <version> <tag> <output file>')
  }
  const electron = JSON.parse(readFileSync('node_modules/electron/package.json', 'utf8')) as { version: string }
  const bom = JSON.parse(readFileSync(input, 'utf8')) as Bom
  const runtime = { electron: electron.version, embedded: { '@hpcc-js/wasm-graphviz': await graphvizVersion() } }
  writeFileSync(output, `${JSON.stringify(releaseSbom(bom, { version, tag }, runtime), null, 2)}\n`)
}

if (import.meta.main) await main()
