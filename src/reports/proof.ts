import { base64UrlToBytes, bytesToBase64Url } from '../lib/base64url.ts'

/** Returns the value of the proof header for a solved proof of work. */
export function encodeProof(proof: unknown): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(proof)))
}

/** Returns the solved proof of work from the value of the proof header, or `null` for a value that is not one. */
export function decodeProof(header: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(header))) as unknown
  } catch {
    return null
  }
}
