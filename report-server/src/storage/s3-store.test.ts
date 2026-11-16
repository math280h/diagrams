import { AwsClient } from 'aws4fetch'
import { beforeAll, describe, expect, it } from 'vitest'
import type { S3Settings } from '../config'
import { createS3Store, parseListObjects } from './s3-store'

const ID = 'a'.repeat(32)
const HASH = 'b'.repeat(64)
const SETTINGS: S3Settings = {
  endpoint: 'https://s3.example.com',
  bucket: 'reports',
  region: 'auto',
  accessKeyId: 'key',
  secretAccessKey: 'secret',
  pathStyle: false,
  prefix: 'reports/',
}

function listing(keys: { key: string; lastModified: string }[], next?: string) {
  const contents = keys
    .map(
      ({ key, lastModified }) => `<Contents><Key>${key}</Key><LastModified>${lastModified}</LastModified></Contents>`,
    )
    .join('')
  const truncated = next ? `<IsTruncated>true</IsTruncated><NextContinuationToken>${next}</NextContinuationToken>` : ''
  return `<?xml version="1.0"?><ListBucketResult>${contents}${truncated}</ListBucketResult>`
}

function recordingFetch(answer: (request: Request) => Response) {
  const requests: Request[] = []
  const fetchImplementation = async (input: Request | string | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    requests.push(request)
    return answer(request)
  }
  return { requests, fetch: fetchImplementation }
}

describe('parseListObjects', () => {
  it('reads the keys, the times and the next page', () => {
    const page = parseListObjects(
      listing([{ key: 'reports/a&amp;b.age', lastModified: '2026-11-01T00:00:00.000Z' }], 'n&amp;1'),
    )
    expect(page).toEqual({
      objects: [{ key: 'reports/a&b.age', lastModified: Date.parse('2026-11-01T00:00:00.000Z') }],
      next: 'n&1',
    })
    expect(parseListObjects(listing([])).next).toBeNull()
  })
})

describe('createS3Store', () => {
  it('signs each request, and uses virtual-hosted or path-style addresses', async () => {
    const virtual = recordingFetch(() => new Response(null, { status: 200 }))
    await createS3Store(SETTINGS, virtual.fetch).put(ID, new Uint8Array([1]), { deleteHash: HASH, createdAt: 5 })
    const [put] = virtual.requests
    expect(put?.method).toBe('PUT')
    expect(put?.url).toBe(`https://reports.s3.example.com/reports/${ID}.age`)
    expect(put?.headers.get('authorization')).toMatch(/^AWS4-HMAC-SHA256 Credential=key\/\d{8}\/auto\/s3\/aws4_request/)
    expect(put?.headers.get('x-amz-meta-delete-hash')).toBe(HASH)
    expect(put?.headers.get('x-amz-meta-created-at')).toBe('5')

    const pathStyle = recordingFetch(() => new Response(null, { status: 200 }))
    await createS3Store({ ...SETTINGS, endpoint: 'http://127.0.0.1:8333/base/', pathStyle: true }, pathStyle.fetch).put(
      ID,
      new Uint8Array([1]),
      { deleteHash: HASH, createdAt: 5 },
    )
    expect(pathStyle.requests[0]?.url).toBe(`http://127.0.0.1:8333/base/reports/reports/${ID}.age`)
  })

  it('deletes a report only with the matching hash', async () => {
    const recorded = recordingFetch((request) =>
      request.method === 'HEAD'
        ? new Response(null, { status: 200, headers: { 'x-amz-meta-delete-hash': HASH } })
        : new Response(null, { status: 204 }),
    )
    const store = createS3Store(SETTINGS, recorded.fetch)
    expect(await store.remove(ID, 'c'.repeat(64))).toBe('forbidden')
    expect(recorded.requests.map((request) => request.method)).toEqual(['HEAD'])
    expect(await store.remove(ID, HASH)).toBe('deleted')
    expect(recorded.requests.map((request) => request.method)).toEqual(['HEAD', 'HEAD', 'DELETE'])

    const missing = createS3Store(SETTINGS, recordingFetch(() => new Response(null, { status: 404 })).fetch)
    expect(await missing.remove(ID, HASH)).toBe('missing')
  })

  it('tells the status, and not the bucket answer, when the bucket refuses', async () => {
    const refused = createS3Store(
      SETTINGS,
      recordingFetch(() => new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 })).fetch,
    )
    await expect(refused.put(ID, new Uint8Array([1]), { deleteHash: HASH, createdAt: 1 })).rejects.toThrow(
      'The bucket refused to store a report: status 403.',
    )
    await expect(refused.remove(ID, HASH)).rejects.toThrow('status 403')
    await expect(refused.sweep(0)).rejects.toThrow('The bucket refused to list the reports: status 403.')
  })

  it('deletes old reports on each page of the list, and keeps other objects', async () => {
    const pages = [
      listing(
        [
          { key: `reports/${ID}.age`, lastModified: '2026-10-01T00:00:00Z' },
          { key: `reports/${'d'.repeat(32)}.age`, lastModified: '2026-11-11T00:00:00Z' },
          { key: 'reports/readme.txt', lastModified: '2026-01-01T00:00:00Z' },
        ],
        'page-2',
      ),
      listing([{ key: `reports/${'e'.repeat(32)}.age`, lastModified: '2026-10-02T00:00:00Z' }]),
    ]
    const recorded = recordingFetch((request) => {
      if (request.method === 'DELETE') return new Response(null, { status: 204 })
      const token = new URL(request.url).searchParams.get('continuation-token')
      return new Response(pages[token === 'page-2' ? 1 : 0])
    })
    const deleted = await createS3Store(SETTINGS, recorded.fetch).sweep(Date.parse('2026-11-01T00:00:00Z'))
    expect(deleted).toBe(2)
    const deletes = recorded.requests.filter((request) => request.method === 'DELETE').map((request) => request.url)
    expect(deletes).toEqual([
      `https://reports.s3.example.com/reports/${ID}.age`,
      `https://reports.s3.example.com/reports/${'e'.repeat(32)}.age`,
    ])
    const list = new URL(recorded.requests[0]!.url)
    expect(list.searchParams.get('list-type')).toBe('2')
    expect(list.searchParams.get('prefix')).toBe('reports/')
  })
})

const LIVE = {
  endpoint: process.env['S3_TEST_ENDPOINT'],
  bucket: process.env['S3_TEST_BUCKET'] ?? 'reports-test',
  accessKeyId: process.env['S3_TEST_ACCESS_KEY_ID'],
  secretAccessKey: process.env['S3_TEST_SECRET_ACCESS_KEY'],
}

describe.skipIf(!LIVE.endpoint)('createS3Store with a live bucket', () => {
  const settings: S3Settings = {
    endpoint: LIVE.endpoint ?? '',
    bucket: LIVE.bucket,
    region: process.env['S3_TEST_REGION'] ?? 'us-east-1',
    accessKeyId: LIVE.accessKeyId ?? '',
    secretAccessKey: LIVE.secretAccessKey ?? '',
    pathStyle: true,
    prefix: `test-${Date.now()}/`,
  }

  beforeAll(async () => {
    const client = new AwsClient({ ...settings, service: 's3' })
    const response = await client.fetch(`${settings.endpoint.replace(/\/$/, '')}/${settings.bucket}`, { method: 'PUT' })
    if (!response.ok && response.status !== 409) throw new Error(`Could not make the test bucket: ${response.status}`)
  })

  it('stores, deletes and sweeps reports', async () => {
    const store = createS3Store(settings)
    await store.put(ID, new Uint8Array([1, 2, 3]), { deleteHash: HASH, createdAt: Date.now() })
    expect(await store.remove(ID, 'c'.repeat(64))).toBe('forbidden')
    expect(await store.remove(ID, HASH)).toBe('deleted')
    expect(await store.remove(ID, HASH)).toBe('missing')
    await store.put(ID, new Uint8Array([1]), { deleteHash: HASH, createdAt: Date.now() })
    expect(await store.sweep(Date.now() - 60_000)).toBe(0)
    expect(await store.sweep(Date.now() + 60_000)).toBe(1)
    expect(await store.remove(ID, HASH)).toBe('missing')
  })

  it('refuses a wrong secret key', async () => {
    const store = createS3Store({ ...settings, secretAccessKey: 'wrong' })
    await expect(store.put(ID, new Uint8Array([1]), { deleteHash: HASH, createdAt: 1 })).rejects.toThrow(/status 403/)
  })
})
