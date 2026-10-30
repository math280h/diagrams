/** The keys whose values are ids of the diagram: `id` defines one or points to one, the others point to one. */
export const ID_KEYS: ReadonlySet<string> = new Set(['id', 'source', 'target', 'parentId', 'fromStep', 'rejoinStep'])

const NUMBERED_ID = /^([a-z]{1,4})_[0-9a-z]+$/
const MARKER = /^([a-z]{1,4})_$/
/** Matches the values that the decoder could read as a marker or a numbered id, before an escape `~`. */
const ESCAPABLE = /^[a-z]{1,4}_[0-9a-z]*~*$/
const ESCAPE = '~'

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

function mapIds(value: Json, map: (key: string, id: string) => string): Json {
  if (Array.isArray(value)) return value.map((item) => mapIds(item, map))
  if (value === null || typeof value !== 'object') return value
  const out: { [key: string]: Json } = {}
  for (const [key, child] of Object.entries(value)) {
    out[key] = typeof child === 'string' && ID_KEYS.has(key) ? map(key, child) : mapIds(child, map)
  }
  return out
}

function counter() {
  const counts = new Map<string, number>()
  return (prefix: string) => {
    const n = counts.get(prefix) ?? 0
    counts.set(prefix, n + 1)
    return `${prefix}_${n.toString(36)}`
  }
}

/**
 * Returns the content with ids that a link does not need to store. Each id becomes its prefix and a number in the
 * order of its first `id`, such as `n_3`. That first `id` keeps only the prefix, `n_`, because the order gives the
 * number. Other values in id keys that look like such ids get an escape `~`.
 *
 * @see withExplicitIds for the way back.
 */
export function withImplicitIds(content: Json): Json {
  const next = counter()
  const numbers = new Map<string, string>()
  mapIds(content, (key, id) => {
    const match = key === 'id' ? NUMBERED_ID.exec(id) : null
    if (match && !numbers.has(id)) numbers.set(id, next(match[1]!))
    return id
  })
  const defined = new Set<string>()
  return mapIds(content, (key, id) => {
    const numbered = numbers.get(id)
    if (numbered === undefined) return ESCAPABLE.test(id) ? id + ESCAPE : id
    if (key === 'id' && !defined.has(id)) {
      defined.add(id)
      return numbered.slice(0, numbered.indexOf('_') + 1)
    }
    return numbered
  })
}

/** Returns the content of {@link withImplicitIds} with every id in full again. */
export function withExplicitIds(content: Json): Json {
  const next = counter()
  return mapIds(content, (key, id) => {
    if (id.endsWith(ESCAPE) && ESCAPABLE.test(id)) return id.slice(0, -ESCAPE.length)
    const marker = key === 'id' ? MARKER.exec(id) : null
    return marker ? next(marker[1]!) : id
  })
}

export type { Json }
