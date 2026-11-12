import { createChallenge, verifySolution } from 'altcha-lib'
import { deriveKey } from 'altcha-lib/algorithms/web/pbkdf2'
import { z } from 'zod'
import { decodeProof } from '@/reports/proof'
import { altchaChallengeSchema } from '@/reports/protocol'
import { CHALLENGE_TTL_MS, UsedProofs, type ProofProvider, type SizeClass } from './provider'

// ALTCHA needs about 256 attempts for a challenge. Each attempt runs PBKDF2 with this number of iterations.
const PBKDF2_ITERATIONS: Record<SizeClass, number> = { text: 5_000, dump: 20_000 }

const proofSchema = z.object({
  challenge: altchaChallengeSchema,
  solution: z.object({ counter: z.number(), derivedKey: z.string(), time: z.number().optional() }),
})

/** Returns the provider that asks for an ALTCHA proof of work with PBKDF2, signed with the secret. */
export function altchaProof(secret: string, now: () => number = Date.now): ProofProvider {
  const used = new UsedProofs(now)
  return {
    async issue(sizeClass) {
      const challenge = await createChallenge({
        algorithm: 'PBKDF2/SHA-256',
        cost: PBKDF2_ITERATIONS[sizeClass],
        deriveKey,
        expiresAt: new Date(now() + CHALLENGE_TTL_MS),
        hmacSignatureSecret: secret,
        data: { size: sizeClass },
      })
      return { provider: 'altcha', challenge: altchaChallengeSchema.parse(challenge) }
    },
    async verify(header, sizeClass) {
      if (header === null) return false
      const proof = proofSchema.safeParse(decodeProof(header))
      if (!proof.success) return false
      const { challenge, solution } = proof.data
      const data = challenge.parameters['data'] as Record<string, unknown> | undefined
      if (data?.['size'] !== sizeClass) return false
      const result = await verifySolution({
        challenge,
        solution,
        deriveKey,
        hmacSignatureSecret: secret,
      })
      if (!result.verified) return false
      const expiresAt = Number(challenge.parameters['expiresAt'] ?? 0) * 1000
      return used.claim(`altcha:${challenge.signature}`, expiresAt || now() + CHALLENGE_TTL_MS)
    },
  }
}
