import { describe, expect, it } from 'vitest'
import { embeddedComponent } from './sbom-components.ts'
import { type Bom, EMBEDDED_VERSIONS, type Release, releaseSbom } from './sbom.ts'
import { EMBEDDED_SOFTWARE } from './third-party-licenses.ts'

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
    {
      type: 'library',
      name: 'undici',
      version: '7.30.1',
      purl: 'pkg:npm/undici@7.30.1',
      'bom-ref': 'pkg:npm/undici@7.30.1',
    },
    {
      type: 'library',
      name: 'undici',
      version: '6.29.1',
      purl: 'pkg:npm/undici@6.29.1',
      'bom-ref': 'pkg:npm/undici@6.29.1',
    },
    { type: 'library', name: 'zod', version: '4.6.7', purl: 'pkg:npm/zod@4.6.7', 'bom-ref': 'pkg:npm/zod@4.6.7' },
  ],
  dependencies: [
    { ref: 'pkg:npm/diagrams@0.1.1', dependsOn: ['pkg:npm/%40hpcc-js/wasm-graphviz@1.30.0', 'pkg:npm/zod@4.6.7'] },
    { ref: 'pkg:npm/zod@4.6.7', dependsOn: [] },
  ],
}

const RELEASE: Release = {
  version: '0.2.0',
  tag: 'v0.2.0',
  bundled: [
    { name: '@hpcc-js/wasm-graphviz', version: '1.30.0' },
    { name: 'Graphviz', holder: { name: '@hpcc-js/wasm-graphviz', version: '1.30.0' } },
    { name: 'undici', version: '7.30.1' },
    { name: 'llhttp', holder: { name: 'undici', version: '7.30.1' } },
    { name: 'zod', version: '4.6.7' },
  ],
  inside: {
    '@hpcc-js/wasm-graphviz@1.30.0': [embeddedComponent('@hpcc-js/wasm-graphviz', '16.1.0')],
    'undici@7.30.1': [embeddedComponent('undici', '9.3.0')],
  },
  runtime: { type: 'framework', name: 'electron', version: '45.0.0', 'bom-ref': 'pkg:npm/electron@45.0.0' },
  installer: { type: 'application', name: 'app-builder-lib', 'bom-ref': 'pkg:npm/app-builder-lib@26.17.0' },
  data: [{ type: 'data', name: 'Simple Icons', 'bom-ref': 'icons:logos' }],
}

function component(sbom: Bom, name: string, version: string) {
  return sbom.components.find((found) => found.name === name && found.version === version)
}

describe('release SBOM', () => {
  it('names the app at the release version, with a GitHub purl in place of the npm purl', () => {
    const sbom = releaseSbom(PNPM_SBOM, RELEASE)
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
    const sbom = releaseSbom(PNPM_SBOM, { ...RELEASE, version: '0.2.1-preview.57', tag: 'preview-57' })
    expect(sbom.metadata.component.version).toBe('0.2.1-preview.57')
    expect(sbom.metadata.component.purl).toBe('pkg:github/math280h/diagrams@preview-57')
  })

  it('adds the Electron runtime, the installer builder and the data as dependencies of the app', () => {
    const sbom = releaseSbom(PNPM_SBOM, RELEASE)
    expect(sbom.components.slice(-3)).toEqual([RELEASE.runtime, RELEASE.installer, ...RELEASE.data])
    const root = sbom.dependencies.find((dependency) => dependency.ref === 'pkg:github/math280h/diagrams@v0.2.0')
    expect(root?.dependsOn).toEqual([
      'pkg:npm/%40hpcc-js/wasm-graphviz@1.30.0',
      'pkg:npm/zod@4.6.7',
      'pkg:npm/electron@45.0.0',
      'pkg:npm/app-builder-lib@26.17.0',
      'icons:logos',
    ])
    expect(sbom.dependencies).toContainEqual({ ref: 'pkg:npm/electron@45.0.0', dependsOn: [] })
    expect(sbom.dependencies).toContainEqual({ ref: 'icons:logos', dependsOn: [] })
  })

  it('puts each program inside the version of the package that holds it in the bundles', () => {
    const sbom = releaseSbom(PNPM_SBOM, RELEASE)
    expect(component(sbom, 'wasm-graphviz', '1.30.0')?.components).toEqual([
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
    expect(component(sbom, 'undici', '7.30.1')?.components).toMatchObject([
      { name: 'llhttp', version: '9.3.0', cpe: 'cpe:2.3:a:llhttp:llhttp:9.3.0:*:*:*:*:*:*:*' },
    ])
    expect(component(sbom, 'undici', '6.29.1')?.components).toBeUndefined()
    expect(component(sbom, 'zod', '4.6.7')).toEqual(PNPM_SBOM.components[3])
  })

  it('fails when the bundles hold a package that the SBOM of pnpm does not list', () => {
    const bundled = [...RELEASE.bundled, { name: 'fflate', version: '0.8.3' }]
    expect(() => releaseSbom(PNPM_SBOM, { ...RELEASE, bundled })).toThrow(/does not list: fflate@0\.8\.3\./)
  })

  it('fails when a program inside a bundled package has no component', () => {
    expect(() => releaseSbom(PNPM_SBOM, { ...RELEASE, inside: {} })).toThrow(
      /no component for Graphviz in @hpcc-js\/wasm-graphviz@1\.30\.0/,
    )
  })

  it('finds a version for the program in each package of the embedded software list', () => {
    expect(Object.keys(EMBEDDED_VERSIONS).toSorted()).toEqual(Object.keys(EMBEDDED_SOFTWARE).toSorted())
  })
})
