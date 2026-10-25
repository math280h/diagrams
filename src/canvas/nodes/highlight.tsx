import { Fragment } from 'react'

/**
 * Returns true if a card line reads as a value that people copy, such as a host, a path or an
 * address range.
 *
 * @example isIdentifier('checkout.shop.dev') // true
 * @example isIdentifier('Go, 3 replicas') // false
 */
export function isIdentifier(text: string): boolean {
  const plain = text.replace(/[{}]/g, '')
  if (/\/|:\d|^[A-Z]+ \//.test(plain)) return true
  return !/\s/.test(plain) && /[^A-Za-z]/.test(plain)
}

export function renderHighlighted(text: string) {
  const parts = text.split(/(\{[^{}]*\})/g)
  return parts.map((part, index) =>
    part.startsWith('{') && part.endsWith('}') ? (
      <span key={index} className="dg-hl">
        {part.slice(1, -1)}
      </span>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  )
}
