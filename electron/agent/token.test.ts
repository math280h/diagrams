import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bearerMatches, createToken, loadToken } from './token'

let folder: string

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'agent-token-'))
})

afterEach(() => {
  rmSync(folder, { recursive: true, force: true })
})

describe('agent token', () => {
  it('keeps the same token across loads and changes it on reset', () => {
    const first = loadToken(folder)
    expect(first).toMatch(/^[\w-]{43}$/)
    expect(loadToken(folder)).toBe(first)
    expect(createToken(folder)).not.toBe(first)
  })

  it('replaces a damaged token file', () => {
    writeFileSync(path.join(folder, 'agent-token'), 'short')
    expect(loadToken(folder)).toMatch(/^[\w-]{43}$/)
  })

  it('matches only the exact bearer header', () => {
    const token = loadToken(folder)
    expect(bearerMatches(`Bearer ${token}`, token)).toBe(true)
    expect(bearerMatches(`Bearer ${token}x`, token)).toBe(false)
    expect(bearerMatches(token, token)).toBe(false)
    expect(bearerMatches(null, token)).toBe(false)
  })
})
