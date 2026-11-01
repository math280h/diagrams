import { describe, expect, it } from 'vitest'
import { differences, elfSize } from './installer-contents.ts'

interface Section {
  type: number
  offset: number
  size: number
}

function elf(sections: Section[], tableOffset: number, fileSize: number): Uint8Array {
  const file = new Uint8Array(fileSize)
  const view = new DataView(file.buffer)
  view.setUint32(0, 0x7f454c46)
  view.setUint8(4, 2)
  view.setUint8(5, 1)
  view.setBigUint64(0x28, BigInt(tableOffset), true)
  view.setUint16(0x3a, 64, true)
  view.setUint16(0x3c, sections.length, true)
  sections.forEach((section, index) => {
    const entry = tableOffset + index * 64
    view.setUint32(entry + 4, section.type, true)
    view.setBigUint64(entry + 0x18, BigInt(section.offset), true)
    view.setBigUint64(entry + 0x20, BigInt(section.size), true)
  })
  return file
}

describe('elfSize', () => {
  it('ends after the section header table', () => {
    const sections = [{ type: 1, offset: 64, size: 100 }]
    expect(elfSize(elf(sections, 200, 1000))).toBe(264)
  })

  it('ends after a section that follows the section header table', () => {
    const sections = [
      { type: 1, offset: 64, size: 100 },
      { type: 7, offset: 400, size: 50 },
    ]
    expect(elfSize(elf(sections, 200, 1000))).toBe(450)
  })

  it('ignores the size of a section without data', () => {
    const sections = [{ type: 8, offset: 64, size: 5000 }]
    expect(elfSize(elf(sections, 200, 1000))).toBe(264)
  })

  it('rejects a file that is not a 64-bit ELF program', () => {
    expect(() => elfSize(new Uint8Array(100))).toThrow('The file does not start with a 64-bit ELF program.')
  })
})

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
