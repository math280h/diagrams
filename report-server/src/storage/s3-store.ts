import { AwsClient } from 'aws4fetch'
import { REPORT_ID } from '@/reports/protocol'
import type { S3Settings } from '../config'
import { sameHash, type RemoveResult, type ReportStore } from './store'

const DELETE_HASH_HEADER = 'x-amz-meta-delete-hash'
const CREATED_AT_HEADER = 'x-amz-meta-created-at'

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function tagValues(xml: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g')
  return [...xml.matchAll(pattern)].map((match) => decodeXml(match[1] ?? ''))
}

/** Returns the keys and the last change times of a ListObjectsV2 answer, and the token of the next page. */
export function parseListObjects(xml: string) {
  const objects = tagValues(xml, 'Contents').map((contents) => ({
    key: tagValues(contents, 'Key')[0] ?? '',
    lastModified: Date.parse(tagValues(contents, 'LastModified')[0] ?? ''),
  }))
  const truncated = tagValues(xml, 'IsTruncated')[0] === 'true'
  return { objects, next: truncated ? (tagValues(xml, 'NextContinuationToken')[0] ?? null) : null }
}

function failure(response: Response, action: string): Error {
  return new Error(`The bucket refused to ${action}: status ${response.status}.`)
}

/** Returns a store that keeps each report as an object in an S3-compatible bucket, with its metadata in headers. */
export function createS3Store(settings: S3Settings, fetchImplementation: typeof fetch = fetch): ReportStore {
  const client = new AwsClient({
    accessKeyId: settings.accessKeyId,
    secretAccessKey: settings.secretAccessKey,
    service: 's3',
    region: settings.region,
  })
  const endpoint = new URL(settings.endpoint)
  const basePath = endpoint.pathname.replace(/\/+$/, '')
  const bucketUrl = settings.pathStyle
    ? `${endpoint.origin}${basePath}/${settings.bucket}`
    : `${endpoint.protocol}//${settings.bucket}.${endpoint.host}${basePath}`
  const objectUrl = (id: string) => `${bucketUrl}/${settings.prefix}${id}.age`
  const send = async (url: string, init: RequestInit) => {
    const signed = await client.sign(url, init)
    return fetchImplementation(signed)
  }
  const removeObject = async (url: string) => {
    const response = await send(url, { method: 'DELETE' })
    if (!response.ok && response.status !== 404) throw failure(response, 'delete a report')
  }
  return {
    async put(id, bytes, report) {
      const response = await send(objectUrl(id), {
        method: 'PUT',
        body: bytes,
        headers: {
          'content-type': 'application/octet-stream',
          [DELETE_HASH_HEADER]: report.deleteHash,
          [CREATED_AT_HEADER]: String(report.createdAt),
        },
      })
      if (!response.ok) throw failure(response, 'store a report')
    },
    async remove(id, deleteHash): Promise<RemoveResult> {
      const head = await send(objectUrl(id), { method: 'HEAD' })
      if (head.status === 404) return 'missing'
      if (!head.ok) throw failure(head, 'read a report')
      const stored = head.headers.get(DELETE_HASH_HEADER) ?? ''
      if (!sameHash(stored, deleteHash)) return 'forbidden'
      await removeObject(objectUrl(id))
      return 'deleted'
    },
    async sweep(before) {
      let deleted = 0
      let token: string | null = null
      do {
        const query = new URLSearchParams({ 'list-type': '2', prefix: settings.prefix })
        if (token) query.set('continuation-token', token)
        const response = await send(`${bucketUrl}/?${query.toString()}`, { method: 'GET' })
        if (!response.ok) throw failure(response, 'list the reports')
        const page = parseListObjects(await response.text())
        for (const object of page.objects) {
          const id = object.key.slice(settings.prefix.length).replace(/\.age$/, '')
          if (!object.key.startsWith(settings.prefix) || !REPORT_ID.test(id)) continue
          if (!(object.lastModified < before)) continue
          await removeObject(objectUrl(id))
          deleted++
        }
        token = page.next
      } while (token)
      return deleted
    },
  }
}
