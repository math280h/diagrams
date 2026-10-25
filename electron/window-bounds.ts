import type { Rect } from '@/model/rect'

export interface WindowState {
  bounds: Rect | null
  maximized: boolean
  fullScreen: boolean
}

/** The smallest part of a saved window that must be on a screen to restore it there. */
const MIN_VISIBLE_PX = { width: 120, height: 48 }

function isBounds(value: unknown): value is Rect {
  if (typeof value !== 'object' || value === null) return false
  const { x, y, width, height } = value as Record<string, unknown>
  return (
    [x, y, width, height].every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    Number(width) > 0 &&
    Number(height) > 0
  )
}

/**
 * Reads a saved window state from parsed JSON.
 *
 * @returns The state, with `bounds: null` when there are no saved bounds or they are not valid.
 */
export function parseWindowState(raw: unknown): WindowState {
  const value = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  return {
    bounds: isBounds(value.bounds) ? value.bounds : null,
    maximized: value.maximized === true,
    fullScreen: value.fullScreen === true,
  }
}

function overlap(a: Rect, b: Rect) {
  return {
    width: Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
    height: Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  }
}

/**
 * Fits saved window bounds to the screens that are connected now.
 *
 * @param workAreas - The work area of each display.
 * @returns The bounds, made smaller if they do not fit the display, or `null` if too little of the window is on a screen.
 */
export function restorableBounds(saved: Rect, workAreas: Rect[]): Rect | null {
  const display = workAreas.find((area) => {
    const visible = overlap(saved, area)
    return visible.width >= MIN_VISIBLE_PX.width && visible.height >= MIN_VISIBLE_PX.height
  })
  if (!display) return null
  const width = Math.min(saved.width, display.width)
  const height = Math.min(saved.height, display.height)
  return {
    x: Math.min(Math.max(saved.x, display.x), display.x + display.width - width),
    y: Math.min(Math.max(saved.y, display.y), display.y + display.height - height),
    width,
    height,
  }
}
