import { timingSafeEqual } from 'node:crypto'

/** Returns true if two hex hashes are the same, in a time that does not depend on their content. */
export function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex')
  const right = Buffer.from(b, 'hex')
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right)
}

export interface StoredReport {
  /** The SHA-256 hash of the delete token, as hex. */
  deleteHash: string
  /** The time when the server stored the report, in milliseconds since 1970. */
  createdAt: number
}

export type RemoveResult = 'deleted' | 'missing' | 'forbidden'

/** Where the server keeps encrypted reports: a folder or a bucket. */
export interface ReportStore {
  put(id: string, bytes: Uint8Array, report: StoredReport): Promise<void>
  /** Deletes the report if the hash matches the hash of its delete token. */
  remove(id: string, deleteHash: string): Promise<RemoveResult>
  /** Deletes each report stored before the time, and returns how many it deleted. */
  sweep(before: number): Promise<number>
}
