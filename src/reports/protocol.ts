import { z } from '../lib/zod.ts'

export const REPORT_API = {
  health: '/v1/health',
  challenge: '/v1/challenge',
  reports: '/v1/reports',
} as const

/** The request header that carries the solved proof of work. */
export const PROOF_HEADER = 'x-report-proof'

export const POW_PROVIDERS = ['none', 'altcha', 'cap'] as const
export type PowProvider = (typeof POW_PROVIDERS)[number]

/** The largest encrypted report that a report server accepts, in bytes. */
export const REPORT_SIZE_LIMITS = {
  /** A report without a crash dump. */
  text: 64 * 1024,
  /** A report with a crash dump. */
  dump: 16 * 1024 * 1024,
} as const

export const REPORT_ID = /^[\da-f]{32}$/
export const DELETE_TOKEN = /^[\w-]{43}$/

export const altchaChallengeSchema = z.object({
  parameters: z.looseObject({
    algorithm: z.string(),
    nonce: z.string(),
    salt: z.string(),
    cost: z.number(),
    keyLength: z.number(),
    keyPrefix: z.string(),
  }),
  signature: z.string(),
})
export type AltchaChallenge = z.infer<typeof altchaChallengeSchema>

const capChallengeSchema = z.object({
  token: z.string(),
  challenge: z.object({ c: z.number().int().min(1), s: z.number().int().min(1), d: z.number().int().min(1) }),
})
export type CapChallenge = z.infer<typeof capChallengeSchema>

/** The answer to `GET /v1/challenge`: the proof of work that the server wants before it takes a report. */
export const challengeResponseSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('none') }),
  z.object({ provider: z.literal('altcha'), challenge: altchaChallengeSchema }),
  z.object({ provider: z.literal('cap'), challenge: capChallengeSchema }),
])
export type ChallengeResponse = z.infer<typeof challengeResponseSchema>

/** The answer to `POST /v1/reports`. */
export const receiptSchema = z.object({
  id: z.string().regex(REPORT_ID),
  /** Lets the sender delete the report. The server keeps only its hash. */
  deleteToken: z.string().regex(DELETE_TOKEN),
  /** The time when the server deletes the report, in milliseconds since 1970. */
  expiresAt: z.number(),
})
export type Receipt = z.infer<typeof receiptSchema>

export const errorBodySchema = z.object({ message: z.string() })

/** Returns the address of a path of the report API, below the base address of the server. */
export function reportApiUrl(base: string, apiPath: string): string {
  const root = base.endsWith('/') ? base : `${base}/`
  return new URL(apiPath.slice(1), root).toString()
}
