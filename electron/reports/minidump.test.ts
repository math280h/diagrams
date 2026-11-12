import { describe, expect, it } from 'vitest'
import { readMinidump } from './minidump'

interface DumpModule {
  base: bigint
  size: number
  name: string
}

interface DumpParts {
  platform: number
  architecture: number
  version?: [number, number, number]
  exception?: { code: number; address: bigint }
  modules?: DumpModule[]
  modulePadding?: boolean
}

function utf16(text: string): Uint8Array {
  const bytes = new Uint8Array(4 + text.length * 2)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, text.length * 2, true)
  for (let i = 0; i < text.length; i++) view.setUint16(4 + i * 2, text.charCodeAt(i), true)
  return bytes
}

function minidump(parts: DumpParts): Uint8Array {
  const chunks: Uint8Array[] = []
  let offset = 0
  const append = (bytes: Uint8Array) => {
    const at = offset
    chunks.push(bytes)
    offset += bytes.length
    return at
  }
  const streams: { type: number; bytes: Uint8Array }[] = []

  const system = new Uint8Array(56)
  const systemView = new DataView(system.buffer)
  systemView.setUint16(0, parts.architecture, true)
  const [major, minor, build] = parts.version ?? [10, 0, 26200]
  systemView.setUint32(8, major, true)
  systemView.setUint32(12, minor, true)
  systemView.setUint32(16, build, true)
  systemView.setUint32(20, parts.platform, true)
  streams.push({ type: 7, bytes: system })

  if (parts.exception) {
    const exception = new Uint8Array(168)
    const view = new DataView(exception.buffer)
    view.setUint32(8, parts.exception.code, true)
    view.setBigUint64(24, parts.exception.address, true)
    streams.push({ type: 6, bytes: exception })
  }

  const header = new Uint8Array(32)
  const directory = new Uint8Array(12 * (streams.length + (parts.modules ? 1 : 0)))
  append(header)
  const directoryRva = append(directory)
  const placed = streams.map((stream) => ({ type: stream.type, size: stream.bytes.length, rva: append(stream.bytes) }))

  if (parts.modules) {
    const padding = parts.modulePadding ? 4 : 0
    const list = new Uint8Array(4 + padding + parts.modules.length * 108)
    const listRva = append(list)
    const view = new DataView(list.buffer)
    view.setUint32(0, parts.modules.length, true)
    parts.modules.forEach((module, index) => {
      const entry = 4 + padding + index * 108
      view.setBigUint64(entry, module.base, true)
      view.setUint32(entry + 8, module.size, true)
      view.setUint32(entry + 20, append(utf16(module.name)), true)
    })
    placed.push({ type: 4, size: list.length, rva: listRva })
  }

  const headerView = new DataView(header.buffer)
  headerView.setUint32(0, 0x504d444d, true)
  headerView.setUint32(4, 0xa793, true)
  headerView.setUint32(8, placed.length, true)
  headerView.setUint32(12, directoryRva, true)
  const directoryView = new DataView(directory.buffer)
  placed.forEach((stream, index) => {
    directoryView.setUint32(index * 12, stream.type, true)
    directoryView.setUint32(index * 12 + 4, stream.size, true)
    directoryView.setUint32(index * 12 + 8, stream.rva, true)
  })

  const bytes = new Uint8Array(offset)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.length
  }
  return bytes
}

const APP_BASE = 0x7ff6_0000_0000n

describe('readMinidump', () => {
  it('reads the exception and the module of the crash of a Windows dump', () => {
    const dump = minidump({
      platform: 2,
      architecture: 9,
      exception: { code: 0xc0000005, address: APP_BASE + 0x1a2b3cn },
      modules: [
        { base: 0x1000_0000n, size: 0x1000, name: 'C:\\Windows\\System32\\ntdll.dll' },
        { base: APP_BASE, size: 0x20_0000, name: 'C:\\Users\\ana\\AppData\\Local\\Programs\\Diagrams\\Diagrams.exe' },
      ],
    })
    expect(readMinidump(dump)).toEqual({
      exception: 'EXCEPTION_ACCESS_VIOLATION',
      location: 'Diagrams.exe+0x1a2b3c',
    })
  })

  it('names the signal of a Linux dump and the Mach exception of a macOS dump', () => {
    const linux = minidump({
      platform: 0x8201,
      architecture: 12,
      version: [6, 8, 0],
      exception: { code: 11, address: 5n },
    })
    expect(readMinidump(linux)).toEqual({ exception: 'SIGSEGV', location: '' })
    const mac = minidump({
      platform: 0x8101,
      architecture: 12,
      version: [15, 1, 0],
      exception: { code: 1, address: 5n },
    })
    expect(readMinidump(mac)?.exception).toBe('EXC_BAD_ACCESS')
  })

  it('reads a module list with padding after the count', () => {
    const dump = minidump({
      platform: 0x8201,
      architecture: 9,
      exception: { code: 6, address: 0x5010n },
      modules: [{ base: 0x5000n, size: 0x100, name: '/opt/Diagrams/diagrams' }],
      modulePadding: true,
    })
    expect(readMinidump(dump)).toMatchObject({ exception: 'SIGABRT', location: 'diagrams+0x10' })
  })

  it('gives the code of an unknown exception, and empty facts for a dump without an exception', () => {
    expect(
      readMinidump(minidump({ platform: 2, architecture: 9, exception: { code: 0x1234, address: 1n } })),
    ).toMatchObject({
      exception: '0x00001234',
    })
    expect(readMinidump(minidump({ platform: 2, architecture: 5 }))).toEqual({ exception: '', location: '' })
  })

  it('refuses bytes that are not a minidump, and survives a cut dump', () => {
    expect(readMinidump(new TextEncoder().encode('not a minidump at all, just some text'))).toBeNull()
    expect(readMinidump(new Uint8Array(4))).toBeNull()
    const dump = minidump({
      platform: 2,
      architecture: 9,
      exception: { code: 0xc0000005, address: APP_BASE },
      modules: [{ base: APP_BASE, size: 0x100, name: 'Diagrams.exe' }],
    })
    for (const length of [32, 60, 120, dump.length - 10]) {
      expect(() => readMinidump(dump.subarray(0, length))).not.toThrow()
    }
  })
})
