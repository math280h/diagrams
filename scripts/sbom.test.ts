import { describe, expect, it } from 'vitest'
import { type Bom, releaseSbom } from './sbom.ts'

const PNPM_SBOM: Bom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.6',
  serialNumber: 'urn:uuid:0c45e2c8-1fd4-4b11-9121-dcfb59a486ca',
  version: 1,
  metadata: {
    timestamp: '2026-10-31T20:33:38.119Z',
    component: {
      type: 'application',
      name: 'diagrams',
      version: '0.1.1',
      purl: 'pkg:npm/diagrams@0.1.1',
      'bom-ref': 'pkg:npm/diagrams@0.1.1',
      licenses: [{ license: { id: 'MIT' } }],
    },
  },
  components: [
    {
      type: 'library',
      name: 'wasm-graphviz',
      group: '@hpcc-js',
      version: '1.30.0',
      purl: 'pkg:npm/%40hpcc-js/wasm-graphviz@1.30.0',
      'bom-ref': 'pkg:npm/%40hpcc-js/wasm-graphviz@1.30.0',
    },
    { type: 'library', name: 'zod', version: '4.6.7', purl: 'pkg:npm/zod@4.6.7', 'bom-ref': 'pkg:npm/zod@4.6.7' },
  ],
  dependencies: [
    { ref: 'pkg:npm/diagrams@0.1.1', dependsOn: ['pkg:npm/%40hpcc-js/wasm-graphviz@1.30.0', 'pkg:npm/zod@4.6.7'] },
    { ref: 'pkg:npm/zod@4.6.7', dependsOn: [] },
  ],
}

const RELEASE = { version: '0.2.0', tag: 'v0.2.0' }
const RUNTIME = { electron: '45.0.0', embedded: { '@hpcc-js/wasm-graphviz': '16.1.0' } }

describe('release SBOM', () => {
  it('names the app at the release version, with a GitHub purl in place of the npm purl', () => {
    const sbom = releaseSbom(PNPM_SBOM, RELEASE, RUNTIME)
    expect(sbom.metadata.component).toMatchObject({
      type: 'application',
      name: 'Diagrams',
      version: '0.2.0',
      purl: 'pkg:github/math280h/diagrams@v0.2.0',
      'bom-ref': 'pkg:github/math280h/diagrams@v0.2.0',
      licenses: [{ license: { id: 'MIT' } }],
    })
    expect(sbom.metadata.timestamp).toBe(PNPM_SBOM.metadata.timestamp)
    expect(sbom.serialNumber).toBe(PNPM_SBOM.serialNumber)
    expect(sbom.dependencies.map((dependency) => dependency.ref)).not.toContain('pkg:npm/diagrams@0.1.1')
  })

  it('names the tag of a build of main in the purl', () => {
    const sbom = releaseSbom(PNPM_SBOM, { version: '0.2.1-preview.57', tag: 'preview-57' }, RUNTIME)
    expect(sbom.metadata.component.version).toBe('0.2.1-preview.57')
    expect(sbom.metadata.component.purl).toBe('pkg:github/math280h/diagrams@preview-57')
  })

  it('adds the Electron runtime as a dependency of the app', () => {
    const sbom = releaseSbom(PNPM_SBOM, RELEASE, RUNTIME)
    expect(sbom.components).toContainEqual(
      expect.objectContaining({
        type: 'framework',
        name: 'electron',
        version: '45.0.0',
        purl: 'pkg:npm/electron@45.0.0',
        cpe: 'cpe:2.3:a:electronjs:electron:45.0.0:*:*:*:*:node.js:*:*',
      }),
    )
    const root = sbom.dependencies.find((dependency) => dependency.ref === 'pkg:github/math280h/diagrams@v0.2.0')
    expect(root?.dependsOn).toEqual([
      'pkg:npm/%40hpcc-js/wasm-graphviz@1.30.0',
      'pkg:npm/zod@4.6.7',
      'pkg:npm/electron@45.0.0',
    ])
    expect(sbom.dependencies).toContainEqual({ ref: 'pkg:npm/electron@45.0.0', dependsOn: [] })
  })

  it('puts Graphviz inside the package that compiles it to WebAssembly, and keeps the other packages', () => {
    const sbom = releaseSbom(PNPM_SBOM, RELEASE, RUNTIME)
    const wasm = sbom.components.find((component) => component.name === 'wasm-graphviz')
    expect(wasm?.components).toEqual([
      {
        type: 'library',
        name: 'Graphviz',
        version: '16.1.0',
        'bom-ref': 'pkg:generic/graphviz@16.1.0',
        purl: 'pkg:generic/graphviz@16.1.0',
        cpe: 'cpe:2.3:a:graphviz:graphviz:16.1.0:*:*:*:*:*:*:*',
        licenses: [{ license: { id: 'EPL-2.0' } }],
        externalReferences: [{ type: 'vcs', url: 'https://gitlab.com/graphviz/graphviz' }],
      },
    ])
    expect(sbom.components.find((component) => component.name === 'zod')).toEqual(PNPM_SBOM.components[1])
  })
})
