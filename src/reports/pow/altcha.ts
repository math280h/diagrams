import { solveChallenge } from 'altcha-lib'
import { deriveKey } from 'altcha-lib/algorithms/web/pbkdf2'
import type { AltchaChallenge } from '../protocol'
import { abortError } from './abort'

const TIMEOUT_MS = 120_000

/**
 * Solves an ALTCHA challenge that uses PBKDF2, with the Web Crypto API of the browser or of Node.
 *
 * @throws Error If the challenge uses another algorithm, or the work takes longer than 2 minutes.
 * @throws DOMException An `AbortError` when the signal stops the work.
 */
export async function solveAltcha(challenge: AltchaChallenge, signal?: AbortSignal) {
  if (!challenge.parameters.algorithm.startsWith('PBKDF2/')) {
    throw new Error(`The report server asks for an unknown proof of work, ${challenge.parameters.algorithm}.`)
  }
  const controller = new AbortController()
  signal?.addEventListener('abort', () => controller.abort(), { once: true })
  const solution = await solveChallenge({
    challenge,
    controller,
    deriveKey,
    timeout: TIMEOUT_MS,
  })
  if (signal?.aborted) throw abortError()
  if (!solution) throw new Error('The proof of work took too long.')
  return { challenge, solution }
}
