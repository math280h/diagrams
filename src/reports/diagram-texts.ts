const TEXT_KEYS: ReadonlySet<string> = new Set([
  'name',
  'title',
  'label',
  'text',
  'description',
  'owner',
  'url',
  'meterText',
  'badge',
  'detail',
  'example',
  'caption',
  'event',
])
const PAYLOAD_FIELDS_KEY = 'fields'
const PAYLOAD_PATH_KEY = 'path'
const MAX_DEPTH = 40

/**
 * Returns the texts that a user wrote in a diagram or in a part of one, such as names, labels, captions, links and
 * example values. It skips ids, icons and other values that the app sets.
 */
export function diagramTexts(value: unknown): string[] {
  const texts = new Set<string>()
  const visit = (node: unknown, container: string | null, depth: number) => {
    if (depth > MAX_DEPTH || node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) visit(item, container, depth + 1)
      return
    }
    for (const [key, child] of Object.entries(node)) {
      if (typeof child === 'string') {
        const payloadPath = key === PAYLOAD_PATH_KEY && container === PAYLOAD_FIELDS_KEY
        if ((TEXT_KEYS.has(key) || payloadPath) && child.trim() !== '') texts.add(child)
      } else {
        visit(child, key, depth + 1)
      }
    }
  }
  visit(value, null, 0)
  return [...texts]
}
