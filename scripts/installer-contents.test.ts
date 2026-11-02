import { describe, expect, it } from 'vitest'
import { differences } from './installer-contents.ts'

describe('differences', () => {
  const listed = [
    { name: 'StdUtils.dll', sha256: 'aa' },
    { name: 'WinShell.dll', sha256: 'bb' },
  ]

  it('accepts the listed files and the known files', () => {
    const found = [
      { name: 'stdutils.dll', sha256: 'aa' },
      { name: 'WinShell.dll', sha256: 'bb' },
      { name: 'System.dll', sha256: 'cc' },
    ]
    expect(differences(found, listed, ['System.dll'])).toEqual([])
  })

  it('accepts a copy of a listed file under a link name', () => {
    const libraries = [{ name: 'libXss.so.1.0.0', sha256: 'aa' }]
    const found = [
      { name: 'libXss.so.1.0.0', sha256: 'aa' },
      { name: 'libXss.so.1', sha256: 'aa' },
    ]
    expect(differences(found, libraries)).toEqual([])
  })

  it('names a file that the SBOM does not list, a changed file and a missing file', () => {
    const found = [
      { name: 'StdUtils.dll', sha256: 'ff' },
      { name: 'UAC.dll', sha256: 'dd' },
    ]
    expect(differences(found, listed)).toEqual([
      'StdUtils.dll has the SHA-256 ff, but the SBOM gives aa.',
      'The installer holds UAC.dll, but the SBOM does not list it.',
      'The SBOM lists StdUtils.dll, but the installer does not hold it.',
      'The SBOM lists WinShell.dll, but the installer does not hold it.',
    ])
  })
})
