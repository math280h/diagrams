/** The playback speeds that the editor and Present offer, as multiples of the normal speed. */
export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2] as const

/** Returns the short name of a playback speed, for example "1.5×". */
export function rateLabel(rate: number): string {
  return `${rate}×`
}

/**
 * Returns the next slower or faster speed of {@link PLAYBACK_RATES} after `rate`. At the end of the list, it returns
 * the last speed.
 */
export function nextRate(rate: number, direction: 1 | -1): number {
  const rates: readonly number[] = PLAYBACK_RATES
  if (direction === 1) return rates.find((candidate) => candidate > rate) ?? rates.at(-1)!
  return rates.findLast((candidate) => candidate < rate) ?? rates[0]!
}
