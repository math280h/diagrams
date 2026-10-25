import type { Ease } from '@/model/schema'

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

export function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2
}

export function applyEase(ease: Ease, t: number): number {
  switch (ease) {
    case 'linear':
      return t
    case 'inOut':
      return easeInOutCubic(t)
    case 'hold':
      return t < 1 ? 0 : 1
  }
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function mod1(value: number): number {
  return value - Math.floor(value)
}
