import { describe, expect, it } from 'vitest'
import { removedIds, setOfId, withIds } from './icon-ids.ts'

describe('setOfId', () => {
  it('gives the prefix of a set icon, and lucide for a Lucide name', () => {
    expect(setOfId('aws:lambda')).toBe('aws')
    expect(setOfId('logo:go')).toBe('logo')
    expect(setOfId('database')).toBe('lucide')
  })
})

describe('withIds', () => {
  it('adds new names to their sets in order and keeps every name of the list', () => {
    const list = { lucide: ['database', 'server'], logo: ['logo:gone'] }
    expect(withIds(list, ['anchor', 'database', 'logo:go', 'aws:lambda'])).toEqual({
      aws: ['aws:lambda'],
      logo: ['logo:go', 'logo:gone'],
      lucide: ['anchor', 'database', 'server'],
    })
  })

  it('writes the sets in order', () => {
    expect(Object.keys(withIds({ lucide: [] }, ['k8s:pod', 'aws:s3']))).toEqual(['aws', 'k8s', 'lucide'])
  })
})

describe('removedIds', () => {
  it('finds the names of the base list that the new list does not have', () => {
    const base = { lucide: ['database', 'server'], logo: ['logo:go'] }
    expect(removedIds(base, { lucide: ['database', 'server', 'anchor'], logo: ['logo:go'] })).toEqual([])
    expect(removedIds(base, { lucide: ['database'] })).toEqual(['server', 'logo:go'])
    expect(removedIds({}, { lucide: ['database'] })).toEqual([])
  })
})
