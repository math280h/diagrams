import type { ChallengeResponse } from '@/reports/protocol'

/** How much work a challenge asks for: a report without a crash dump, or a larger report with one. */
export type SizeClass = 'text' | 'dump'

/** A proof-of-work provider behind the two calls of the report API. */
export interface ProofProvider {
  issue(sizeClass: SizeClass): Promise<ChallengeResponse>
  /**
   * Returns true for a valid, unused proof for the size class, and marks it used.
   *
   * @param header - The value of the proof header, or `null` when the request has none.
   */
  verify(header: string | null, sizeClass: SizeClass): Promise<boolean>
}

/** The challenge lifetime of each provider, in milliseconds. */
export const CHALLENGE_TTL_MS = 2 * 60 * 1000

/** Remembers used proofs until they expire. A proof works once. */
export class UsedProofs {
  readonly #expiries = new Map<string, number>()
  readonly #now: () => number
  readonly #limit: number

  constructor(now: () => number = Date.now, limit = 100_000) {
    this.#now = now
    this.#limit = limit
  }

  /** Returns true and remembers the key if nobody used it before. */
  claim(key: string, expiresAt: number): boolean {
    const now = this.#now()
    if ((this.#expiries.get(key) ?? 0) > now) return false
    if (this.#expiries.size >= this.#limit) this.#prune(now)
    if (this.#expiries.size >= this.#limit) return false
    this.#expiries.set(key, expiresAt)
    return true
  }

  #prune(now: number) {
    for (const [key, expiry] of this.#expiries) if (expiry <= now) this.#expiries.delete(key)
  }
}
