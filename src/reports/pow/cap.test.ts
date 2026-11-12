import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { describe, expect, it } from 'vitest'
import { capPuzzle, fnv1a, prngHex, solveCap } from './cap'

describe('fnv1a', () => {
  it('matches the FNV-1a test values', () => {
    expect(fnv1a('')).toBe(0x811c9dc5)
    expect(fnv1a('a')).toBe(0xe40c292c)
    expect(fnv1a('foobar')).toBe(0xbf9cf968)
  })

  it('continues from a state', () => {
    expect(fnv1a('bar', fnv1a('foo'))).toBe(fnv1a('foobar'))
  })
})

describe('prngHex', () => {
  it('returns the asked number of hex characters, the same for the same seed', () => {
    expect(prngHex(1, 20)).toMatch(/^[\da-f]{20}$/)
    expect(prngHex(1, 20)).toBe(prngHex(1, 20))
    expect(prngHex(1, 8)).toBe(prngHex(1, 20).slice(0, 8))
    expect(prngHex(2, 8)).not.toBe(prngHex(1, 8))
  })
})

describe('solveCap', () => {
  it('finds a number for each puzzle whose hash starts with the target', async () => {
    const challenge = { token: 'header.payload.signature', challenge: { c: 3, s: 16, d: 2 } }
    const { token, solutions } = await solveCap(challenge)
    expect(token).toBe(challenge.token)
    expect(solutions).toHaveLength(3)
    solutions.forEach((nonce, index) => {
      const { salt, target } = capPuzzle(challenge.token, index + 1, 16, 2)
      expect(bytesToHex(sha256(new TextEncoder().encode(`${salt}${nonce}`))).startsWith(target)).toBe(true)
    })
  })

  it('stops when the signal stops it', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(solveCap({ token: 't', challenge: { c: 1, s: 16, d: 6 } }, controller.signal)).rejects.toThrow(
      'The proof of work stopped.',
    )
  })
})
