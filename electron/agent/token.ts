import { randomBytes, timingSafeEqual } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { RANDOM_KEY_BYTES, RANDOM_KEY_PATTERN } from '@/desktop/constants'

const TOKEN_FILE = 'agent-token'
const OWNER_ONLY = 0o600

function write(folder: string, token: string) {
  mkdirSync(folder, { recursive: true })
  writeFileSync(path.join(folder, TOKEN_FILE), token, { mode: OWNER_ONLY })
  return token
}

/** Makes a new access token for agents and saves it in the folder. */
export function createToken(folder: string): string {
  return write(folder, randomBytes(RANDOM_KEY_BYTES).toString('base64url'))
}

/** Reads the saved access token, or makes one if the folder has none. */
export function loadToken(folder: string): string {
  try {
    const token = readFileSync(path.join(folder, TOKEN_FILE), 'utf8').trim()
    if (RANDOM_KEY_PATTERN.test(token)) return token
  } catch {
    return createToken(folder)
  }
  return createToken(folder)
}

/** Compares an Authorization header with the token in constant time. */
export function bearerMatches(header: string | null | undefined, token: string): boolean {
  if (!header) return false
  const given = Buffer.from(header)
  const expected = Buffer.from(`Bearer ${token}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}
