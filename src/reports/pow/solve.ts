import { encodeProof } from '../proof'
import type { ChallengeResponse } from '../protocol'

/**
 * Solves the proof of work of a challenge and returns the value of the proof header, or `null` when the server asks for
 * no proof of work.
 */
export async function solveProof(response: ChallengeResponse, signal?: AbortSignal): Promise<string | null> {
  switch (response.provider) {
    case 'none':
      return null
    case 'altcha': {
      const { solveAltcha } = await import('./altcha')
      return encodeProof(await solveAltcha(response.challenge, signal))
    }
    case 'cap': {
      const { solveCap } = await import('./cap')
      return encodeProof(await solveCap(response.challenge, signal))
    }
  }
}
