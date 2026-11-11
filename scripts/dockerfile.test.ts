import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { pinnedImages } from './image-sbom.ts'

const dockerfile = readFileSync('Dockerfile', 'utf8')
const stages = new Set([...dockerfile.matchAll(/^FROM .* AS (\S+)$/gm)].map((match) => match[1]!))
const sources = [...dockerfile.matchAll(/^FROM (?:--platform=\S+ )?(\S+)/gm)]
  .map((match) => match[1]!)
  .filter((source) => source !== 'scratch' && !stages.has(source))

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

  it('has no cache mount', () => {
    expect(dockerfile).not.toMatch(/--mount=type=cache/)
  })

  it('ships the licence texts of the static-web-server version that it copies', () => {
    const server = pinnedImages(dockerfile).find((image) => image.repository.endsWith('/static-web-server'))
    const licences = [...dockerfile.matchAll(/static-web-server\/v([^/]+)\/LICENSE-/g)].map((match) => match[1])
    expect(licences).toEqual([server?.tag, server?.tag])
  })
})
