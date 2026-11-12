import type { ProofProvider } from './provider'

/** Returns the provider that asks for no proof of work. */
export function noProof(): ProofProvider {
  return {
    issue: async () => ({ provider: 'none' }),
    verify: async () => true,
  }
}
