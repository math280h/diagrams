import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Decrypter, generateX25519Identity, identityToRecipient } from 'age-encryption'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { decodeBundle, decompressDump } from '@/reports/bundle'
import { reportJson, type Report } from '@/reports/report'
import { createReporter, type ReporterOptions } from './reporter'

const NOW = Date.parse('2026-11-12T10:00:00Z')
const SERVER = 'https://reports.example'
const RECEIPT = { id: 'a'.repeat(32), deleteToken: 'B'.repeat(43), expiresAt: NOW + 1000 }

const REPORT: Report = {
  format: 1,
  kind: 'crash',
  time: '2026-11-12T09:59:00.000Z',
  app: { version: '1.2.3', surface: 'desktop', channel: 'release' },
  system: { os: 'windows', browser: 'Chrome 142', electron: '41.0.0' },
  page: 'editor',
  title: 'The app window stopped',
  message: '',
  facts: [],
  error: '',
  frames: [],
  crash: { process: 'renderer', reason: 'crashed', exitCode: 1, exception: '', location: '' },
  note: 'It stopped.',
}

describe('createReporter', () => {
  let folder: string
  let identity: string
  let uploads: Uint8Array[]
  let deletes: string[]

  beforeEach(async () => {
    folder = await mkdtemp(path.join(tmpdir(), 'reporter-'))
    identity = await generateX25519Identity()
    uploads = []
    deletes = []
  })

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true })
  })

  const fakeServer = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input.toString())
    if (url.pathname === '/v1/challenge') return Response.json({ provider: 'none' })
    if (url.pathname === '/v1/reports' && init?.method === 'POST') {
      uploads.push(new Uint8Array(init.body as Uint8Array))
      return Response.json(RECEIPT, { status: 201 })
    }
    if (init?.method === 'DELETE') {
      deletes.push(url.pathname)
      return new Response(null, { status: 204 })
    }
    return new Response(null, { status: 404 })
  }

  const reporter = async (overrides: Partial<ReporterOptions> = {}) => {
    const dump = path.join(folder, 'dump.dmp')
    await writeFile(dump, 'MDMP dump bytes')
    return createReporter({
      reports: { url: SERVER, recipients: [await identityToRecipient(identity)] },
      sentFile: path.join(folder, 'reports', 'sent.json'),
      crashes: { dumpFile: async (id) => (id === 'dump' ? dump : null) },
      fetch: fakeServer,
      chooseFile: async (name) => path.join(folder, name),
      version: '1.2.3',
      electron: '41.0.0',
      platform: 'win32',
      sensitive: () => ['C:\\Users\\ana'],
      now: () => NOW,
      ...overrides,
    })
  }

  const decrypt = async (bytes: Uint8Array) => {
    const decrypter = new Decrypter()
    decrypter.addIdentity(identity)
    return decodeBundle(await decrypter.decrypt(bytes))
  }

  it('sends the exact report text with the crash dump, encrypted, and keeps the receipt', async () => {
    const reports = await reporter()
    const json = reportJson(REPORT)
    const sent = await reports.send(json, 'dump')
    expect(sent).toEqual({
      ...RECEIPT,
      sentAt: NOW,
      title: REPORT.title,
      withDump: true,
      server: SERVER,
    })
    const bundle = await decrypt(uploads[0]!)
    expect(bundle.json).toBe(json)
    expect(new TextDecoder().decode(await decompressDump(bundle.dump!, 1000))).toBe('MDMP dump bytes')
    expect(await reports.sent()).toEqual([sent])
  })

  it('deletes a sent report from the server and from the list', async () => {
    const reports = await reporter()
    await reports.send(reportJson(REPORT), null)
    expect(await reports.deleteSent(RECEIPT.id)).toEqual([])
    expect(deletes).toEqual([`/v1/reports/${RECEIPT.id}`])
    expect(await reports.sent()).toEqual([])
  })

  it('saves the encrypted report where the user chooses, and nothing when the user cancels', async () => {
    const reports = await reporter()
    expect(await reports.save(reportJson(REPORT), null)).toEqual({ saved: true })
    const bytes = await readFile(path.join(folder, 'diagrams-report-2026-11-12.age'))
    expect((await decrypt(new Uint8Array(bytes))).dump).toBeNull()
    const cancelled = await reporter({ chooseFile: async () => null })
    expect(await cancelled.save(reportJson(REPORT), null)).toEqual({ saved: false })
  })

  it('refuses text that is not a report, a missing dump, and a build without a server or keys', async () => {
    const reports = await reporter()
    await expect(reports.send('{"title":"x"}', null)).rejects.toThrow('does not have the form of a problem report')
    await expect(reports.send('not json', null)).rejects.toThrow('not valid JSON')
    await expect(reports.send(reportJson(REPORT), 'gone')).rejects.toThrow('not on this computer any more')
    const noServer = await reporter({ reports: { url: null, recipients: [await identityToRecipient(identity)] } })
    await expect(noServer.send(reportJson(REPORT), null)).rejects.toThrow('This build sends no reports')
    const noKeys = await reporter({ reports: { url: SERVER, recipients: [] } })
    await expect(noKeys.save(reportJson(REPORT), null)).rejects.toThrow('no keys')
    expect(uploads).toEqual([])
  })

  it('gives the facts of the app for a report', async () => {
    expect((await reporter()).context()).toEqual({
      version: '1.2.3',
      electron: '41.0.0',
      os: 'windows',
      sensitive: ['C:\\Users\\ana'],
    })
    expect((await reporter({ platform: 'freebsd' })).context().os).toBe('other')
  })
})
