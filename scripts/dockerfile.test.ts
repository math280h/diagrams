import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { pinnedImages } from './image-sbom.ts'

const dockerfile = readFileSync('Dockerfile', 'utf8')
const stages = new Set([...dockerfile.matchAll(/^FROM .* AS (\S+)$/gm)].map((match) => match[1]!))
const sources = [...dockerfile.matchAll(/^FROM (?:--platform=\S+ )?(\S+)/gm)]
  .map((match) => match[1]!)
  .filter((source) => source !== 'scratch' && !stages.has(source))
const serviceId = 'e3f64b02-d3db-4aa3-afd2-acf19f1d664f'

describe('Dockerfile', () => {
  it('builds with the pnpm version of package.json', () => {
    const { packageManager } = JSON.parse(readFileSync('package.json', 'utf8')) as { packageManager: string }
    const pnpm = pinnedImages(dockerfile).find((image) => image.repository === 'ghcr.io/pnpm/pnpm')
    expect(`pnpm@${pnpm?.tag}`).toBe(packageManager)
  })

  it('pins each image by tag and digest', () => {
    expect(sources.length).toBeGreaterThan(0)
    expect(pinnedImages(dockerfile)).toHaveLength(sources.length)
  })

  it('gives each cache mount the ID s/<service ID>-<target>', () => {
    const mounts = [...dockerfile.matchAll(/--mount=type=cache,(\S+)/g)].map(
      (match) => new Map(match[1]!.split(',').map((option) => option.split('=') as [string, string])),
    )
    expect(mounts.length).toBeGreaterThan(0)
    for (const mount of mounts) {
      expect(mount.get('id')).toBe(`s/${serviceId}-${mount.get('target')}`)
    }
  })

  it('takes the report server build options as build arguments with empty defaults', () => {
    for (const name of ['DIAGRAMS_REPORT_URL', 'DIAGRAMS_REPORT_KEYS']) {
      expect(dockerfile).toMatch(new RegExp(`^ARG ${name}=$`, 'm'))
    }
  })

  it('ships the licence texts of the static-web-server version that it copies', () => {
    const server = pinnedImages(dockerfile).find((image) => image.repository.endsWith('/static-web-server'))
    const licences = [...dockerfile.matchAll(/static-web-server\/v([^/]+)\/LICENSE-/g)].map((match) => match[1])
    expect(licences).toEqual([server?.tag, server?.tag])
  })
})

describe('report-server/Dockerfile', () => {
  const reportServer = readFileSync('report-server/Dockerfile', 'utf8')
  const reportStages = new Set([...reportServer.matchAll(/^FROM .* AS (\S+)$/gm)].map((match) => match[1]!))
  const reportSources = [...reportServer.matchAll(/^FROM (?:--platform=\S+ )?(\S+)/gm)]
    .map((match) => match[1]!)
    .filter((source) => source !== 'scratch' && !reportStages.has(source))

  it('pins each image by tag and digest, with the pnpm version of package.json and of the website image', () => {
    expect(pinnedImages(reportServer)).toHaveLength(reportSources.length)
    const pnpm = (text: string) => pinnedImages(text).find((image) => image.repository === 'ghcr.io/pnpm/pnpm')
    expect(pnpm(reportServer)).toEqual(pnpm(dockerfile))
  })

  it('builds on any host: without cache mounts and without a VOLUME instruction', () => {
    expect(reportServer).not.toContain('--mount=type=cache')
    expect(reportServer).not.toMatch(/^VOLUME /m)
  })

  it('runs the server bundle as the non-root user of a distroless Node.js image', () => {
    const runtime = pinnedImages(reportServer).at(-1)
    expect(runtime?.repository).toMatch(/^gcr\.io\/distroless\/nodejs\d+-debian\d+$/)
    expect(runtime?.tag).toBe('nonroot')
    expect(reportServer).toMatch(/^USER nonroot$/m)
    expect(reportServer).toMatch(/^CMD \["\/app\/server\.js"\]$/m)
  })
})
