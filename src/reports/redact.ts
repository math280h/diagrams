export const REMOVED = {
  text: '[removed]',
  address: '[address]',
  path: '[path]',
  email: '[email]',
  id: '[id]',
  token: '[token]',
  data: '[data]',
} as const

const MIN_SENSITIVE_LENGTH = 3
const MAX_TEXT_LENGTH = 2000

interface Rule {
  pattern: RegExp
  replace: (match: string) => string
}

const LOOPBACK_IPV4 = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/
const LOOPBACK_IPV6 = '::1'
const IPV6_FULL_COLONS = 7

const PATH_REST = String.raw`(?:[^\s"'<>|*?]|\s(?=[^\s"'<>|*?\\/]*[\\/]))*`

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function always(text: string) {
  return () => text
}

function ipv6Address(match: string): string {
  const compressed = match.indexOf('::')
  const single = compressed !== -1 && compressed === match.lastIndexOf('::')
  const full = !match.includes('::') && match.split(':').length - 1 === IPV6_FULL_COLONS
  if (!(single || full) || match === LOOPBACK_IPV6 || !/[\da-f]/i.test(match)) return match
  return REMOVED.address
}

const RULES: readonly Rule[] = [
  { pattern: new RegExp(`${escapeRegExp(REMOVED.text)}[\\\\/]${PATH_REST}`, 'g'), replace: always(REMOVED.path) },
  { pattern: /\bdata:[\w.+-]+\/[\w.+-]+[^\s"'<>)]*/gi, replace: always(REMOVED.data) },
  { pattern: /\b[a-z][a-z\d+.-]*:\/\/[^\s"'<>)\]]+/gi, replace: always(REMOVED.address) },
  { pattern: /\b(?:mailto:)?[\w.%+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z][a-z\d-]*\b/gi, replace: always(REMOVED.email) },
  { pattern: new RegExp(String.raw`(?:\\\\|\b[a-z]:[\\/])${PATH_REST}`, 'gi'), replace: always(REMOVED.path) },
  { pattern: /(?<![\w.:/~-])~?\/(?:[\w.@-][\w.@ -]*\/)+[\w.@-]*/g, replace: always(REMOVED.path) },
  { pattern: /~\/[\w.@/-]+/g, replace: always(REMOVED.path) },
  {
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    replace: (match) => (LOOPBACK_IPV4.test(match) ? match : REMOVED.address),
  },
  { pattern: /(?<![\w:.])(?:[\da-f]{0,4}:){2,7}[\da-f]{0,4}(?![\w:])/gi, replace: ipv6Address },
  { pattern: /\b[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\b/gi, replace: always(REMOVED.id) },
  { pattern: /\b[a-z]{1,2}_[a-z\d]{8,}\b/g, replace: always(REMOVED.id) },
  { pattern: /\b(?=[\w-]*\d)(?=[\w-]*[a-z])[\w-]{24,}\b/gi, replace: always(REMOVED.token) },
]

function sensitivePattern(values: Iterable<string>): RegExp | null {
  const unique = new Set<string>()
  for (const value of values) {
    const trimmed = value.trim()
    if (trimmed.length < MIN_SENSITIVE_LENGTH) continue
    unique.add(trimmed)
    unique.add(trimmed.replace(/\\/g, '/'))
    unique.add(trimmed.replace(/\//g, '\\'))
  }
  if (unique.size === 0) return null
  const sorted = [...unique].toSorted((a, b) => b.length - a.length)
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${sorted.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}_])`, 'giu')
}

/**
 * Returns a function that removes private values from a text before it goes into a report.
 *
 * It first removes each sensitive value as exact text, such as the home folder or the text of the open diagram. Then
 * it removes addresses, file paths, email addresses, network addresses, ids and long tokens. It cuts the result to
 * 2000 characters.
 *
 * @param sensitive - Values that the app knows at run time. Values shorter than 3 characters are ignored.
 */
export function createRedactor(sensitive: Iterable<string> = []): (text: string) => string {
  const exact = sensitivePattern(sensitive)
  return (text) => {
    let result = exact ? text.replace(exact, REMOVED.text) : text
    for (const rule of RULES) result = result.replace(rule.pattern, rule.replace)
    return result.length > MAX_TEXT_LENGTH ? `${result.slice(0, MAX_TEXT_LENGTH)}…` : result
  }
}
