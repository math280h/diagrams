import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dockerfile = readFileSync('Dockerfile', 'utf8')
const images = [...dockerfile.matchAll(/^FROM (?:--platform=\S+ )?(\S+)/gm)].map((match) => match[1]!)

describe('Dockerfile', () => {
  it('builds with the pnpm version of package.json', () => {
    const { packageManager } = JSON.parse(readFileSync('package.json', 'utf8')) as { packageManager: string }
    const pnpmImage = images.find((image) => image.startsWith('ghcr.io/pnpm/pnpm:'))
    expect(pnpmImage?.replace(/^ghcr\.io\/pnpm\/pnpm:([^@]+)@.*$/, 'pnpm@$1')).toBe(packageManager)
  })

  it('pins each image by digest', () => {
    expect(images.length).toBeGreaterThan(0)
    expect(images.filter((image) => !/@sha256:[0-9a-f]{64}$/.test(image))).toEqual([])
  })
})
