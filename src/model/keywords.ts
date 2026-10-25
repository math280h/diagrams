/**
 * Returns the candidate with the longest keyword that occurs as whole words in the label.
 *
 * @returns The matched candidate, or `undefined` if no keyword occurs in the label.
 */
export function matchKeywords<T extends { keywords: readonly string[] }>(
  label: string,
  candidates: readonly T[],
): T | undefined {
  const normalized = ` ${label.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `
  let best: T | undefined
  let bestLength = 0
  for (const candidate of candidates) {
    for (const keyword of candidate.keywords) {
      if (keyword.length > bestLength && normalized.includes(` ${keyword} `)) {
        best = candidate
        bestLength = keyword.length
      }
    }
  }
  return best
}
