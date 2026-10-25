import { afterEach, describe, expect, it, vi } from 'vitest'
import { newId } from './defaults'

describe('newId', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('makes ten lower-case letters and digits after the prefix', () => {
    expect(newId('n')).toMatch(/^n_[0-9a-z]{10}$/)
    expect(newId('d')).not.toBe(newId('d'))
  })

  it('skips the random bytes that would make some characters more likely', () => {
    let call = 0
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
      const bytes = array as unknown as Uint8Array
      bytes.fill(call === 0 ? 252 : 37)
      bytes[0] = call === 0 ? 255 : 1
      call += 1
      return array
    })
    expect(newId('n')).toBe('n_1111111111')
    expect(call).toBe(2)
  })
})
