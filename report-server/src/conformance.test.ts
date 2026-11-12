import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { generateX25519Identity, identityToRecipient } from 'age-encryption'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { encryptReport } from '@/reports/encrypt'
import { solveProof } from '@/reports/pow/solve'
import { decodeProof, encodeProof } from '@/reports/proof'
import {
  challengeResponseSchema,
  PROOF_HEADER,
  REPORT_API,
  REPORT_SIZE_LIMITS,
  reportApiUrl,
  type PowProvider,
} from '@/reports/protocol'
import { deleteReport, ReportServerError, sendReport, type ReportClient } from '@/reports/send'
import { createApp } from './app'
import { readConfig } from './config'
import { createProof, createStore } from './setup'

const REMOTE_URL = process.env['REPORT_SERVER_URL']
const REMOTE_ORIGIN = process.env['REPORT_SERVER_ORIGIN']
const ORIGIN = 'https://diagrams.example'
const SECRET = 'conformance-secret-of-32-characters-or-more'
const SOLVE_TIMEOUT_MS = 120_000

interface Target {
  client: ReportClient
  /** An origin that the server accepts, or `null` when the server is remote and the test knows none. */
  origin: string | null
  close: () => Promise<void>
}

async function localTarget(provider: PowProvider): Promise<Target> {
  const dir = await mkdtemp(path.join(tmpdir(), 'report-server-'))
  const config = readConfig({
    STORAGE: 'fs',
    FS_DIR: dir,
    POW_PROVIDER: provider,
    POW_SECRET: SECRET,
    ALLOWED_ORIGINS: ORIGIN,
  })
  const app = createApp({ config, store: createStore(config), proof: createProof(config) })
  return {
    client: {
      endpoint: 'http://report-server.test',
      fetch: async (input, init) => app.request(input, init),
      solve: solveProof,
    },
    origin: ORIGIN,
    close: () => rm(dir, { recursive: true, force: true }),
  }
}

function remoteTarget(url: string): Target {
  return { client: { endpoint: url, fetch, solve: solveProof }, origin: REMOTE_ORIGIN ?? null, close: async () => {} }
}

async function encrypted(size: number): Promise<Uint8Array<ArrayBuffer>> {
  const recipient = await identityToRecipient(await generateX25519Identity())
  return encryptReport(new Uint8Array(size).fill(7), [recipient])
}

async function remoteProvider(url: string): Promise<PowProvider> {
  const response = await fetch(reportApiUrl(url, REPORT_API.health))
  const body = (await response.json()) as { provider: PowProvider }
  return body.provider
}

const providers: PowProvider[] = REMOTE_URL ? [await remoteProvider(REMOTE_URL)] : ['none', 'altcha', 'cap']

describe.each(providers)('the report API with proof of work %s', (provider) => {
  let target: Target

  beforeAll(async () => {
    target = REMOTE_URL ? remoteTarget(REMOTE_URL) : await localTarget(provider)
  })

  afterAll(async () => {
    await target.close()
  })

  const call = (apiPath: string, init?: RequestInit) =>
    target.client.fetch(reportApiUrl(target.client.endpoint, apiPath), init)

  it('names its proof of work in the health answer', async () => {
    const response = await call(REPORT_API.health)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, provider })
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it(
    'takes a report, and deletes it with its delete token only',
    async () => {
      const receipt = await sendReport(target.client, await encrypted(2000))
      expect(receipt.expiresAt).toBeGreaterThan(Date.now())

      const wrongToken = await call(`${REPORT_API.reports}/${receipt.id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${'A'.repeat(43)}` },
      })
      expect(wrongToken.status).toBe(403)

      await deleteReport(target.client, receipt)
      const again = await call(`${REPORT_API.reports}/${receipt.id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${receipt.deleteToken}` },
      })
      expect(again.status).toBe(404)
      await expect(deleteReport(target.client, receipt)).resolves.toBeUndefined()
    },
    SOLVE_TIMEOUT_MS,
  )

  it(
    'takes a report larger than the text limit',
    async () => {
      const receipt = await sendReport(target.client, await encrypted(REPORT_SIZE_LIMITS.text + 1))
      await deleteReport(target.client, receipt)
    },
    SOLVE_TIMEOUT_MS,
  )

  it('refuses a report that is not an age file', async () => {
    const response = await call(REPORT_API.reports, { method: 'POST', body: new TextEncoder().encode('plain text') })
    expect(response.status).toBe(400)
  })

  it('refuses a report larger than the dump limit', async () => {
    const challenge = await call(`${REPORT_API.challenge}?size=${REPORT_SIZE_LIMITS.dump + 1}`)
    expect(challenge.status).toBe(413)
    const body = new Uint8Array(REPORT_SIZE_LIMITS.dump + 1)
    body.set(new TextEncoder().encode('age-encryption.org/v1\n'))
    const response = await call(REPORT_API.reports, { method: 'POST', body })
    expect(response.status).toBe(413)
  })

  it('refuses a challenge without a whole number of bytes', async () => {
    for (const size of ['', '0', '-5', '1.5', 'many']) {
      const response = await call(`${REPORT_API.challenge}?size=${size}`)
      expect(response.status).toBe(400)
    }
  })

  it('refuses a delete without a token or for an unknown report', async () => {
    const id = '0'.repeat(32)
    expect((await call(`${REPORT_API.reports}/${id}`, { method: 'DELETE' })).status).toBe(401)
    const unknown = await call(`${REPORT_API.reports}/${id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${'A'.repeat(43)}` },
    })
    expect(unknown.status).toBe(404)
    expect((await call(`${REPORT_API.reports}/not-an-id`, { method: 'DELETE' })).status).toBe(404)
  })

  it('refuses a website that it does not know, and answers the preflight of one that it knows', async () => {
    const unknown = await call(REPORT_API.health, { headers: { origin: 'https://unknown.example' } })
    expect(unknown.status).toBe(403)
    expect(unknown.headers.get('access-control-allow-origin')).toBeNull()
    const opaque = await call(REPORT_API.health, { headers: { origin: 'null' } })
    expect(opaque.status).toBe(403)
    if (!target.origin) return
    const preflight = await call(REPORT_API.reports, {
      method: 'OPTIONS',
      headers: {
        origin: target.origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': PROOF_HEADER,
      },
    })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe(target.origin)
    expect(preflight.headers.get('access-control-allow-headers')).toContain(PROOF_HEADER)
  })

  it.skipIf(provider === 'none')('refuses a report without a proof of work', async () => {
    const response = await call(REPORT_API.reports, { method: 'POST', body: await encrypted(100) })
    expect(response.status).toBe(403)
  })

  it.skipIf(provider === 'none')(
    'takes each proof of work once',
    async () => {
      const bytes = await encrypted(100)
      const challenge = challengeResponseSchema.parse(
        await (await call(`${REPORT_API.challenge}?size=${bytes.length}`)).json(),
      )
      const proof = await solveProof(challenge)
      const post = () =>
        call(REPORT_API.reports, { method: 'POST', headers: { [PROOF_HEADER]: proof ?? '' }, body: bytes })
      const first = await post()
      expect(first.status).toBe(201)
      await deleteReport(target.client, (await first.json()) as { id: string; deleteToken: string })
      expect((await post()).status).toBe(403)
    },
    SOLVE_TIMEOUT_MS,
  )

  it.skipIf(provider === 'none')(
    'refuses a proof of work for a text report on a larger report',
    async () => {
      const challenge = challengeResponseSchema.parse(await (await call(`${REPORT_API.challenge}?size=100`)).json())
      const proof = await solveProof(challenge)
      const response = await call(REPORT_API.reports, {
        method: 'POST',
        headers: { [PROOF_HEADER]: proof ?? '' },
        body: await encrypted(REPORT_SIZE_LIMITS.text + 1),
      })
      expect(response.status).toBe(403)
    },
    SOLVE_TIMEOUT_MS,
  )

  it.skipIf(provider === 'none')(
    'refuses a changed proof of work',
    async () => {
      const bytes = await encrypted(100)
      const challenge = challengeResponseSchema.parse(
        await (await call(`${REPORT_API.challenge}?size=${bytes.length}`)).json(),
      )
      const proof = decodeProof((await solveProof(challenge)) ?? '') as Record<string, unknown>
      const changed =
        provider === 'cap'
          ? { ...proof, solutions: (proof['solutions'] as number[]).map((value) => value + 1) }
          : { ...proof, solution: { ...(proof['solution'] as object), counter: -1 } }
      for (const header of [encodeProof(changed), 'not base64 json', encodeProof({})]) {
        const response = await call(REPORT_API.reports, {
          method: 'POST',
          headers: { [PROOF_HEADER]: header },
          body: bytes,
        })
        expect(response.status).toBe(403)
      }
    },
    SOLVE_TIMEOUT_MS,
  )
})

describe('the report client', () => {
  it('turns a refused report into a message for the user', async () => {
    const client: ReportClient = {
      endpoint: 'http://report-server.test',
      fetch: async () => new Response(JSON.stringify({ message: 'Full.' }), { status: 503 }),
      solve: solveProof,
    }
    const error = await sendReport(client, new Uint8Array(10)).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ReportServerError)
    expect((error as ReportServerError).status).toBe(503)
    expect((error as Error).message).toMatch(/full for today/)
  })

  it('tells the user when the server cannot be reached', async () => {
    const client: ReportClient = {
      endpoint: 'http://report-server.test',
      fetch: async () => {
        throw new TypeError('fetch failed')
      },
      solve: solveProof,
    }
    await expect(sendReport(client, new Uint8Array(10))).rejects.toThrow(/could not be reached/)
  })
})
