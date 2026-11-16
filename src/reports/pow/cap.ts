import { sha256 } from '@noble/hashes/sha2.js'
import type { CapChallenge } from '../protocol'
import { abortError } from './abort'

const FNV_OFFSET = 2166136261
const FNV_PRIME = 16777619
const CLOCK_CHECK_EVERY = 1024
const SLICE_MS = 12
const MAX_ATTEMPTS = 100_000_000

/** Returns the 32-bit FNV-1a hash of a text, continued from a previous state. */
export function fnv1a(text: string, state = FNV_OFFSET): number {
  let hash = state
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, FNV_PRIME)
  }
  return hash >>> 0
}

/** Returns `length` hex characters from a xorshift32 sequence that starts at `seed`. */
export function prngHex(seed: number, length: number): string {
  let state = seed
  let result = ''
  while (result.length < length) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    result += state.toString(16).padStart(8, '0')
  }
  return result.slice(0, length)
}

/** Returns the salt and the hex prefix of puzzle `index`, from 1, of a Cap challenge token. */
export function capPuzzle(token: string, index: number, size: number, difficulty: number) {
  const saltSeed = fnv1a(String(index), fnv1a(token))
  const targetSeed = fnv1a('d', saltSeed)
  return { salt: prngHex(saltSeed, size), target: prngHex(targetSeed, difficulty) }
}

function hexNibbles(hex: string): Uint8Array {
  return Uint8Array.from(hex, (char) => Number.parseInt(char, 16))
}

function startsWithNibbles(hash: Uint8Array, nibbles: Uint8Array): boolean {
  for (let i = 0; i < nibbles.length; i++) {
    const byte = hash[i >> 1] ?? 0
    if ((i % 2 === 0 ? byte >> 4 : byte & 0x0f) !== nibbles[i]) return false
  }
  return true
}

function writeAscii(buffer: Uint8Array, offset: number, text: string): number {
  for (let i = 0; i < text.length; i++) buffer[offset + i] = text.charCodeAt(i)
  return offset + text.length
}

async function solvePuzzle(salt: string, target: string, signal: AbortSignal | undefined): Promise<number> {
  const nibbles = hexNibbles(target)
  const buffer = new Uint8Array(salt.length + 16)
  const saltEnd = writeAscii(buffer, 0, salt)
  let sliceStart = performance.now()
  for (let nonce = 0; nonce < MAX_ATTEMPTS; nonce++) {
    if (signal && nonce % CLOCK_CHECK_EVERY === 0 && performance.now() - sliceStart > SLICE_MS) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      if (signal.aborted) throw abortError()
      sliceStart = performance.now()
    }
    const end = writeAscii(buffer, saltEnd, String(nonce))
    if (startsWithNibbles(sha256(buffer.subarray(0, end)), nibbles)) return nonce
  }
  throw new Error('The proof of work found no answer.')
}

/**
 * Solves a Cap challenge of format 1: for each puzzle, finds the number whose SHA-256 hash of salt and number starts
 * with the hex prefix of the puzzle. With a signal, the work pauses every 12 ms, so that the signal and other tasks
 * can run.
 *
 * @throws DOMException An `AbortError` when the signal stops the work.
 */
export async function solveCap(
  input: CapChallenge,
  signal?: AbortSignal,
): Promise<{ token: string; solutions: number[] }> {
  const { c, s, d } = input.challenge
  const solutions: number[] = []
  for (let index = 1; index <= c; index++) {
    if (signal?.aborted) throw abortError()
    const { salt, target } = capPuzzle(input.token, index, s, d)
    solutions.push(await solvePuzzle(salt, target, signal))
  }
  return { token: input.token, solutions }
}
