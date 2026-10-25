import { useEffect, useState } from 'react'

/** Returns false until the browser painted the component once. */
export function usePainted(): boolean {
  const [painted, setPainted] = useState(false)
  useEffect(() => {
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setPainted(true))
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [])
  return painted
}
