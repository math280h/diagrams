/** The palette of cards, shapes and boundaries. Neutral is the grey of the theme. */
export const COLORS = ['neutral', 'orange', 'yellow', 'green', 'teal', 'blue', 'pink', 'red'] as const
export type Color = (typeof COLORS)[number]

export const COLOR_NAMES: Record<Color, string> = {
  neutral: 'Neutral',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  teal: 'Teal',
  blue: 'Blue',
  pink: 'Pink',
  red: 'Red',
}

const MIN_CHROMA = 40

const HUE_LIMITS: readonly (readonly [number, Color])[] = [
  [15, 'red'],
  [40, 'orange'],
  [70, 'yellow'],
  [165, 'green'],
  [190, 'teal'],
  [265, 'blue'],
  [345, 'pink'],
  [360, 'red'],
]

/**
 * Returns the palette colour nearest to a colour from another app.
 *
 * @param rgb - Red, green and blue, each from 0 to 255.
 * @returns `neutral` for greys, white, black and pale tints.
 */
export function nearestColor([red, green, blue]: readonly [number, number, number]): Color {
  const max = Math.max(red, green, blue)
  const chroma = max - Math.min(red, green, blue)
  if (chroma < MIN_CHROMA) return 'neutral'
  const sector =
    max === red ? (green - blue) / chroma : max === green ? (blue - red) / chroma + 2 : (red - green) / chroma + 4
  const hue = (sector * 60 + 360) % 360
  return HUE_LIMITS.find(([limit]) => hue < limit)![1]
}
