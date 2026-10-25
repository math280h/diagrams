import type { Traffic } from '@/model/schema'
import { mod1 } from './easing'

export const MAX_PARTICLES_PER_EDGE = 40
export const COMET_TRAIL = [
  { offsetPx: 4.5, opacity: 0.55, scale: 0.82 },
  { offsetPx: 9, opacity: 0.3, scale: 0.64 },
  { offsetPx: 13.5, opacity: 0.14, scale: 0.48 },
] as const

export function particleCount(traffic: Traffic, lengthPx: number): number {
  if (lengthPx <= 0) return 0
  return Math.max(1, Math.min(MAX_PARTICLES_PER_EDGE, Math.round((lengthPx / 100) * traffic.density)))
}

/**
 * Returns the location of one particle as a fraction of the path length.
 *
 * @param seed - A value from 0 to 1 that shifts all particles of one edge.
 * @param index - The particle index. With direction `both`, odd indices move in reverse.
 */
export function particleProgress(
  traffic: Traffic,
  seed: number,
  index: number,
  count: number,
  timeMs: number,
  lengthPx: number,
): number {
  const travel = lengthPx > 0 ? ((timeMs / 1000) * traffic.speed) / lengthPx : 0
  const u = mod1(seed + index / count + travel)
  const reverse = traffic.direction === 'reverse' || (traffic.direction === 'both' && index % 2 === 1)
  return reverse ? 1 - u : u
}

/**
 * Returns the distance that dashes move.
 *
 * Use the value as a negative `stroke-dashoffset`.
 */
export function marchOffsetPx(traffic: Traffic, seed: number, timeMs: number, periodPx: number): number {
  const distance = (timeMs / 1000) * traffic.speed + seed * periodPx
  const offset = distance % periodPx
  return traffic.direction === 'reverse' ? offset : -offset
}

export function dashPattern(traffic: Traffic, lengthPx: number): { dash: number; gap: number } {
  if (traffic.style === 'pulse') {
    const dash = Math.max(18, Math.min(120, lengthPx * 0.16))
    return { dash, gap: Math.max(lengthPx, dash * 3) }
  }
  const dash = Math.max(2, traffic.size * 3)
  return { dash, gap: Math.max(4, 100 / traffic.density - dash) }
}
