import { generateChallenge, validateChallenge } from 'capjs-core'
import { z } from 'zod'
import { decodeProof } from '@/reports/proof'
import { CHALLENGE_TTL_MS, UsedProofs, type ProofProvider, type SizeClass } from './provider'

const CHALLENGE_SIZE = 32
const DIFFICULTY = 4
const PUZZLES: Record<SizeClass, number> = { text: 12, dump: 40 }

const proofSchema = z.object({ token: z.string(), solutions: z.array(z.number()) })

/** Returns the provider that asks for a Cap proof of work of format 1 (SHA-256), without browser checks. */
export function capProof(secret: string, now: () => number = Date.now): ProofProvider {
  const used = new UsedProofs(now)
  return {
    async issue(sizeClass) {
      const result = await generateChallenge(secret, {
        challengeCount: PUZZLES[sizeClass],
        challengeSize: CHALLENGE_SIZE,
        challengeDifficulty: DIFFICULTY,
        expiresMs: CHALLENGE_TTL_MS,
        scope: sizeClass,
      })
      if (!('challenge' in result)) throw new Error('Cap made a challenge of an unknown format.')
      return { provider: 'cap', challenge: { token: result.token, challenge: result.challenge } }
    },
    async verify(header, sizeClass) {
      if (header === null) return false
      const proof = proofSchema.safeParse(decodeProof(header))
      if (!proof.success) return false
      const result = await validateChallenge(secret, proof.data, {
        scope: sizeClass,
        consumeNonce: (signature, ttlMs) => used.claim(`cap:${signature}`, now() + ttlMs),
      })
      return result.success
    },
  }
}
