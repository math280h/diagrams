import { strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { isZip, unzipEntries, zipEntries, ZipError, type ZipEntry } from './zip'

const text = (value: string) => new TextEncoder().encode(value)

const ENTRIES: ZipEntry[] = [
  {
    name: 'order-system.diagram.json',
    data: text(JSON.stringify({ nodes: Array.from({ length: 200 }, () => ({ id: 'n' })) })),
  },
  { name: 'folder/système café.diagram.json', data: text('{"name":"Système"}') },
  { name: 'empty.json', data: new Uint8Array() },
  { name: 'noise.bin', data: crypto.getRandomValues(new Uint8Array(512)) },
]

async function zipBytes(entries: readonly ZipEntry[]): Promise<Uint8Array> {
  return new Uint8Array(await (await zipEntries(entries, new Date(2026, 10, 23, 9, 30, 12))).arrayBuffer())
}

function centralHeader(bytes: Uint8Array): DataView {
  const view = new DataView(bytes.buffer)
  return new DataView(bytes.buffer, view.getUint32(bytes.length - 22 + 16, true))
}

describe('zipEntries and unzipEntries', () => {
  it('give back the names and bytes of each file', async () => {
    const bytes = await zipBytes(ENTRIES)
    expect(isZip(bytes)).toBe(true)
    expect(await unzipEntries(bytes)).toEqual(ENTRIES)
  })

  it('write a zip file that another zip tool reads', async () => {
    const files = unzipSync(await zipBytes(ENTRIES))
    expect(Object.keys(files)).toEqual(ENTRIES.map((entry) => entry.name))
    for (const entry of ENTRIES) expect(files[entry.name]).toEqual(entry.data)
  })

  it('deflate a file only when that makes it smaller', async () => {
    const bytes = await zipBytes(ENTRIES)
    expect(bytes.length).toBeLessThan(ENTRIES.reduce((total, entry) => total + entry.data.length, 0))
    const methods: number[] = []
    let header = centralHeader(bytes)
    for (const entry of ENTRIES) {
      methods.push(header.getUint16(10, true))
      header = new DataView(header.buffer, header.byteOffset + 46 + text(entry.name).length)
    }
    expect(methods).toEqual([8, 0, 0, 0])
  })

  it('read a zip file of another zip tool, without its folders', async () => {
    const bytes = zipSync({
      'backup/': {},
      'backup/a.diagram.json': strToU8('{"a":1}'),
      'backup/b.diagram.json': [strToU8('{"b":2}'), { level: 0 }],
    })
    expect(await unzipEntries(bytes)).toEqual([
      { name: 'backup/a.diagram.json', data: strToU8('{"a":1}') },
      { name: 'backup/b.diagram.json', data: strToU8('{"b":2}') },
    ])
  })

  it('read an empty zip file', async () => {
    expect(await unzipEntries(await zipBytes([]))).toEqual([])
  })
})

describe('unzipEntries with bad data', () => {
  const damaged = 'This zip file is damaged or incomplete.'

  it('refuses data that is not a zip file, or a part of one', async () => {
    const bytes = await zipBytes(ENTRIES)
    expect(isZip(text('{"nodes":[]}'))).toBe(false)
    await expect(unzipEntries(text('{"nodes":[]}'))).rejects.toThrow(damaged)
    await expect(unzipEntries(bytes.subarray(0, bytes.length - 30))).rejects.toThrow(damaged)
    await expect(unzipEntries(bytes.subarray(40))).rejects.toThrow(ZipError)
  })

  it('refuses a file whose checksum does not match', async () => {
    const bytes = await zipBytes(ENTRIES)
    const header = centralHeader(bytes)
    header.setUint32(16, header.getUint32(16, true) ^ 1, true)
    await expect(unzipEntries(bytes)).rejects.toThrow(damaged)
  })

  it('refuses deflate data that is not valid', async () => {
    const bytes = await zipBytes(ENTRIES.slice(0, 1))
    bytes.fill(0xff, 60, 80)
    await expect(unzipEntries(bytes)).rejects.toThrow(damaged)
  })

  it('names an encrypted file and an unknown compression', async () => {
    const encrypted = await zipBytes(ENTRIES.slice(0, 1))
    centralHeader(encrypted).setUint16(8, 0x0801, true)
    await expect(unzipEntries(encrypted)).rejects.toThrow('This zip file is encrypted.')

    const unknown = await zipBytes(ENTRIES.slice(0, 1))
    centralHeader(unknown).setUint16(10, 12, true)
    await expect(unzipEntries(unknown)).rejects.toThrow('uses a compression that the app cannot read')
  })

  it('refuses a file that is larger than its stated size', async () => {
    const bytes = await zipBytes(ENTRIES.slice(0, 1))
    const header = centralHeader(bytes)
    header.setUint32(24, header.getUint32(24, true) - 1, true)
    await expect(unzipEntries(bytes)).rejects.toThrow(damaged)
  })
})
