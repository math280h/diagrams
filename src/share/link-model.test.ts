import { describe, expect, it } from 'vitest'
import { TEMPLATES, templateDiagrams } from '@/templates'
import DICTIONARY from './link-dictionary.txt?raw'
import { compress, decompress } from './link-model'
import { linkJson } from './share-link'

const encoder = new TextEncoder()
const dictionary = encoder.encode(DICTIONARY)

function roundTrip(data: Uint8Array, dict: Uint8Array = dictionary) {
  return decompress(compress(data, dict), dict, data.length)
}

function pseudoRandomBytes(length: number, seed: number): Uint8Array {
  const bytes = new Uint8Array(length)
  let state = seed
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0
    bytes[i] = state >>> 24
  }
  return bytes
}

describe('link model', () => {
  it('gives back every template diagram exactly', { timeout: 60_000 }, () => {
    for (const diagram of TEMPLATES.flatMap((template) => templateDiagrams(template))) {
      const data = encoder.encode(linkJson(diagram))
      expect(roundTrip(data)).toEqual(data)
    }
  })

  it('gives back empty, tiny, repeated and random data exactly', { timeout: 60_000 }, () => {
    for (const data of [
      new Uint8Array(0),
      Uint8Array.of(0),
      Uint8Array.of(255),
      new Uint8Array(100_000).fill(97),
      Uint8Array.from({ length: 512 }, (_, i) => i & 255),
      pseudoRandomBytes(20_000, 7),
    ]) {
      expect(roundTrip(data)).toEqual(data)
      expect(roundTrip(data, new Uint8Array(0))).toEqual(data)
    }
  })

  it('codes text that is not in the dictionary in fewer bytes than the text', () => {
    const data = encoder.encode(
      JSON.stringify({ name: 'Payments', nodes: [{ id: 'n_', data: { title: 'Ledger', detail: 'Postgres 17' } }] }),
    )
    expect(compress(data, dictionary).length).toBeLessThan(data.length / 2)
  })

  it('codes data exactly as every earlier version did, so that old links keep their meaning', () => {
    const pinned = encoder.encode('{"nodes":[{"id":"n_","type":"card"}]}'.repeat(20))
    const data = encoder.encode('{"name":"Pinned","nodes":[{"id":"n_","type":"card","data":{"title":"Orders"}}]}')
    expect(btoa(String.fromCharCode(...compress(data, pinned)))).toBe('/bG6EVPYg90WU6lhjLboYttgOJPhS7OEfNyQ0COR')
  })

  it('keeps the dictionary of the format y unchanged', async () => {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', dictionary))
    expect([...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')).toBe(
      '44d7f0bd2e95bc514b117c25607d67d9d9ca6d2b811598e0f01c1f03330bcf91',
    )
  })
})
