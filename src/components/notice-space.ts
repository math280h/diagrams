import { useCallback, useId } from 'react'
import { create } from 'zustand'

const NOTICE_TOP_PX = 64
const NOTICE_GAP_PX = 8
/** The height of the title bar at the top of each page (`dg-titlebar`). */
export const TITLE_BAR_HEIGHT_PX = 44
const MOBILE_NOTICE_TOP_PX = TITLE_BAR_HEIGHT_PX + NOTICE_GAP_PX

const useBarBottoms = create<{ bottoms: ReadonlyMap<string, number> }>(() => ({ bottoms: new Map() }))

function setBarBottom(id: string, bottomPx: number | null) {
  useBarBottoms.setState(({ bottoms }) => {
    const next = new Map(bottoms)
    if (bottomPx === null) next.delete(id)
    else next.set(id, bottomPx)
    return { bottoms: next }
  })
}

/**
 * Returns a ref for a bar at the top centre of the window. While the bar shows, notices stack below it, so that they
 * never cover its buttons.
 */
export function useNoticesBelow(): (element: HTMLElement | null) => (() => void) | undefined {
  const id = useId()
  return useCallback(
    (element: HTMLElement | null) => {
      if (!element) return undefined
      const measure = () => setBarBottom(id, element.getBoundingClientRect().bottom)
      measure()
      const observer = new ResizeObserver(measure)
      observer.observe(element)
      window.addEventListener('resize', measure)
      return () => {
        observer.disconnect()
        window.removeEventListener('resize', measure)
        setBarBottom(id, null)
      }
    },
    [id],
  )
}

/**
 * Returns the distances of the first notice from the top of the window, on wide and on narrow screens. The notices keep
 * the side distances of the notice library.
 */
export function useNoticeOffsets(): { offset: { top: number }; mobileOffset: { top: number } } {
  const belowBarsPx = useBarBottoms(({ bottoms }) =>
    bottoms.size === 0 ? 0 : Math.max(...bottoms.values()) + NOTICE_GAP_PX,
  )
  return {
    offset: { top: Math.max(NOTICE_TOP_PX, belowBarsPx) },
    mobileOffset: { top: Math.max(MOBILE_NOTICE_TOP_PX, belowBarsPx) },
  }
}
