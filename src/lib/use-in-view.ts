import { useCallback, useState } from 'react'

/** Returns the nearest ancestor that scrolls vertically, or `null` when the page itself scrolls. */
function scrollParent(element: Element): Element | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const overflow = getComputedStyle(parent).overflowY
    if (overflow === 'auto' || overflow === 'scroll') return parent
  }
  return null
}

/**
 * Returns a ref callback and whether the element is near the visible part of its scroll container.
 *
 * @param rootMargin - The distance around the visible part that counts as near, as a CSS margin.
 * @param once - If true, the value stays true after the element first comes near.
 */
export function useInView(rootMargin = '200px', once = false): [(element: Element | null) => void, boolean] {
  const [inView, setInView] = useState(false)
  const ref = useCallback(
    (element: Element | null) => {
      if (!element) return
      const observer = new IntersectionObserver(
        ([entry]) => {
          const near = entry?.isIntersecting ?? false
          setInView(near)
          if (near && once) observer.disconnect()
        },
        { root: scrollParent(element), rootMargin },
      )
      observer.observe(element)
      return () => observer.disconnect()
    },
    [rootMargin, once],
  )
  return [ref, inView]
}
