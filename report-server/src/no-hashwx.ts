const MISSING = 'This report server has no HashWX. It issues and checks Cap challenges of format 1 only.'

function missing(): never {
  throw new Error(MISSING)
}

export const HASHWX_SEED_SIZE = 32
export const HASHWX_CHALLENGE_SIZE = 32
export const DEFAULT_HASHWX_NONCES_PER_HASH = 65_536
export const DEFAULT_HASHWX_DIFFICULTY = 1_000_000
export const DEFAULT_HASHWX_CHALLENGE_COUNT = 4
export const MAX_HASHWX_DIFFICULTY = 1_000_000_000
export const MAX_HASHWX_NONCES_PER_HASH = 1_048_576
export const MAX_HASHWX_CHALLENGE_COUNT = 64
export const setHashwxModule = missing
export const hashwxReady = missing
export const hashwxTarget = missing
export const hashwxSeed = missing
export const hashwxHash = missing
export const mintHashwxChallenges = missing
export async function verifyHashwxSolution(): Promise<boolean> {
  return false
}
