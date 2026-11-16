import type { DumpSummary } from '@/desktop/contract'

const SIGNATURE = 0x504d444d
const HEADER_BYTES = 32
const DIRECTORY_ENTRY_BYTES = 12
const MAX_STREAMS = 1000
const MAX_MODULES = 10_000
const MODULE_BYTES = 108
const MAX_NAME_BYTES = 4096

const STREAM = { moduleList: 4, exception: 6, systemInfo: 7 } as const

const PLATFORM = { windows: 2, macos: 0x8101, ios: 0x8102 } as const
const PLATFORM_OFFSET = 20

const WINDOWS_EXCEPTIONS: Record<number, string> = {
  0xc0000005: 'EXCEPTION_ACCESS_VIOLATION',
  0xc0000006: 'EXCEPTION_IN_PAGE_ERROR',
  0xc0000008: 'EXCEPTION_INVALID_HANDLE',
  0xc000001d: 'EXCEPTION_ILLEGAL_INSTRUCTION',
  0xc0000094: 'EXCEPTION_INT_DIVIDE_BY_ZERO',
  0xc00000fd: 'EXCEPTION_STACK_OVERFLOW',
  0xc0000374: 'STATUS_HEAP_CORRUPTION',
  0xc0000409: 'STATUS_STACK_BUFFER_OVERRUN',
  0xc0000420: 'STATUS_ASSERTION_FAILURE',
  0x80000003: 'EXCEPTION_BREAKPOINT',
  0x80000004: 'EXCEPTION_SINGLE_STEP',
  0xe0000008: 'OUT_OF_MEMORY',
}
const SIGNALS: Record<number, string> = {
  4: 'SIGILL',
  5: 'SIGTRAP',
  6: 'SIGABRT',
  7: 'SIGBUS',
  8: 'SIGFPE',
  9: 'SIGKILL',
  11: 'SIGSEGV',
  13: 'SIGPIPE',
  15: 'SIGTERM',
  31: 'SIGSYS',
}
const MACH_EXCEPTIONS: Record<number, string> = {
  1: 'EXC_BAD_ACCESS',
  2: 'EXC_BAD_INSTRUCTION',
  3: 'EXC_ARITHMETIC',
  5: 'EXC_SOFTWARE',
  6: 'EXC_BREAKPOINT',
  10: 'EXC_CRASH',
  11: 'EXC_RESOURCE',
  12: 'EXC_GUARD',
}

type Summary = Omit<DumpSummary, 'bytes'>

interface Module {
  base: bigint
  size: bigint
  nameRva: number
}

class Reader {
  readonly #view: DataView

  constructor(bytes: Uint8Array) {
    this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }

  has(offset: number, length: number): boolean {
    return offset >= 0 && length >= 0 && offset + length <= this.#view.byteLength
  }

  u32(offset: number): number | null {
    return this.has(offset, 4) ? this.#view.getUint32(offset, true) : null
  }

  u64(offset: number): bigint | null {
    return this.has(offset, 8) ? this.#view.getBigUint64(offset, true) : null
  }

  utf16(offset: number): string | null {
    const length = this.u32(offset)
    if (length === null || length > MAX_NAME_BYTES || length % 2 !== 0 || !this.has(offset + 4, length)) return null
    const view = this.#view
    return new TextDecoder('utf-16le').decode(new Uint8Array(view.buffer, view.byteOffset + offset + 4, length))
  }
}

function streams(reader: Reader): Map<number, { size: number; rva: number }> {
  const found = new Map<number, { size: number; rva: number }>()
  const count = reader.u32(8) ?? 0
  const directory = reader.u32(12) ?? 0
  for (let index = 0; index < Math.min(count, MAX_STREAMS); index++) {
    const entry = directory + index * DIRECTORY_ENTRY_BYTES
    const type = reader.u32(entry)
    const size = reader.u32(entry + 4)
    const rva = reader.u32(entry + 8)
    if (type === null || size === null || rva === null || !reader.has(rva, size)) continue
    if (!found.has(type)) found.set(type, { size, rva })
  }
  return found
}

function modules(reader: Reader, stream: { size: number; rva: number } | undefined): Module[] {
  if (!stream) return []
  const count = Math.min(reader.u32(stream.rva) ?? 0, MAX_MODULES)
  const padding = stream.size === 8 + count * MODULE_BYTES ? 4 : 0
  const list: Module[] = []
  for (let index = 0; index < count; index++) {
    const entry = stream.rva + 4 + padding + index * MODULE_BYTES
    const base = reader.u64(entry)
    const size = reader.u32(entry + 8)
    const nameRva = reader.u32(entry + 20)
    if (base === null || size === null || nameRva === null) break
    list.push({ base, size: BigInt(size), nameRva })
  }
  return list
}

function fileName(name: string): string {
  return name.split(/[\\/]/).pop() || 'unknown module'
}

function exceptionName(code: number, platform: number | null): string {
  const names =
    platform === PLATFORM.windows
      ? WINDOWS_EXCEPTIONS
      : platform === PLATFORM.macos || platform === PLATFORM.ios
        ? MACH_EXCEPTIONS
        : SIGNALS
  return names[code] ?? `0x${code.toString(16).padStart(8, '0')}`
}

/**
 * Reads the exception and the place of the crash from a minidump. It reads no memory, no thread and no other data of
 * the dump.
 *
 * @returns The summary, or `null` for bytes that are not a minidump.
 */
export function readMinidump(bytes: Uint8Array): Summary | null {
  const reader = new Reader(bytes)
  if (!reader.has(0, HEADER_BYTES) || reader.u32(0) !== SIGNATURE) return null
  const found = streams(reader)
  const exception = found.get(STREAM.exception)
  if (!exception) return { exception: '', location: '' }
  const systemInfo = found.get(STREAM.systemInfo)
  const platform = systemInfo ? reader.u32(systemInfo.rva + PLATFORM_OFFSET) : null
  const code = reader.u32(exception.rva + 8)
  const address = reader.u64(exception.rva + 24)
  const module =
    address === null
      ? undefined
      : modules(reader, found.get(STREAM.moduleList)).find(
          (candidate) => address >= candidate.base && address < candidate.base + candidate.size,
        )
  const name = module ? fileName(reader.utf16(module.nameRva) ?? '') : ''
  return {
    exception: code === null ? '' : exceptionName(code, platform),
    location: module && address !== null ? `${name}+0x${(address - module.base).toString(16)}` : '',
  }
}
