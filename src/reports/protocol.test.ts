import { describe, expect, it } from 'vitest'
import { decodeProof, encodeProof } from './proof'
import { challengeResponseSchema, reportApiUrl } from './protocol'

describe('reportApiUrl', () => {
  it('adds the API path below the base address', () => {
    expect(reportApiUrl('https://reports.example', '/v1/reports')).toBe('https://reports.example/v1/reports')
    expect(reportApiUrl('https://example.com/reports/', '/v1/health')).toBe('https://example.com/reports/v1/health')
    expect(reportApiUrl('https://example.com/reports', '/v1/health')).toBe('https://example.com/reports/v1/health')
  })
})

describe('encodeProof', () => {
  it('reads back a proof, also with text outside ASCII', () => {
    const proof = { token: 'a.b.c', solutions: [1, 2], note: 'ø✓' }
    const header = encodeProof(proof)
    expect(header).toMatch(/^[\w-]+$/)
    expect(decodeProof(header)).toEqual(proof)
  })

  it('returns null for a header that is not a proof', () => {
    expect(decodeProof('!!!')).toBeNull()
    expect(decodeProof('bm90IGpzb24')).toBeNull()
  })
})

describe('challengeResponseSchema', () => {
  it('reads each provider and refuses unknown ones', () => {
    expect(challengeResponseSchema.safeParse({ provider: 'none' }).success).toBe(true)
    expect(
      challengeResponseSchema.safeParse({
        provider: 'cap',
        challenge: { token: 't', challenge: { c: 1, s: 32, d: 4 } },
      }).success,
    ).toBe(true)
    expect(challengeResponseSchema.safeParse({ provider: 'mcaptcha' }).success).toBe(false)
    expect(
      challengeResponseSchema.safeParse({
        provider: 'cap',
        challenge: { token: 't', challenge: { c: 0, s: 32, d: 4 } },
      }).success,
    ).toBe(false)
  })
})
