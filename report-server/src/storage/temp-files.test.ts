import { describe, expect, it } from 'vitest'
import { targetOfTempName, tempFileOf } from './temp-files'

describe('temporary file names', () => {
  it('gives each write a new name that leads back to the file', () => {
    const first = tempFileOf('report.age')
    expect(first).not.toBe(tempFileOf('report.age'))
    expect(first).toMatch(/^report\.age\.tmp-[0-9a-f]{8}$/)
    expect(targetOfTempName(first)).toBe('report.age')
  })

  it('accepts only the names that the store makes', () => {
    expect(targetOfTempName('a.json.tmp-0a1b2c3d')).toBe('a.json')
    expect(targetOfTempName('a.json.tmp-0000')).toBeNull()
    expect(targetOfTempName('a.json.tmp-0a1b2c3d4')).toBeNull()
    expect(targetOfTempName('a.json.tmp-0A1B2C3D')).toBeNull()
    expect(targetOfTempName('a.json.tmp-0a1b2c3d.bak')).toBeNull()
    expect(targetOfTempName('.tmp-0a1b2c3d')).toBeNull()
    expect(targetOfTempName('a.json')).toBeNull()
  })
})
