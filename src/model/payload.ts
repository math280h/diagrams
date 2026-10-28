import { defaultPayloadField } from './defaults'
import type { EdgeData, Payload, PayloadField, PayloadType } from './schema'

export type PayloadPart = 'request' | 'response'

export type PathToken = { kind: 'key'; name: string } | { kind: 'item' }

type Shape =
  | { kind: 'object'; keys: Map<string, Shape> }
  | { kind: 'array'; item: Shape | null }
  | { kind: 'value'; value: unknown }

type ContainerKind = 'object' | 'array'

const PATH_PART = /^([^.[\]]*)((?:\[\])*)$/

export class PayloadJsonError extends Error {}

/**
 * Splits a field path into names and array items, for example `items[].sku` into `items`, an item and `sku`.
 *
 * @returns The tokens, or `null` if the path is empty or does not follow the rules of {@link PayloadField.path}.
 */
export function parsePath(path: string): PathToken[] | null {
  const parts = path.trim().split('.')
  const tokens: PathToken[] = []
  for (const [index, part] of parts.entries()) {
    const match = PATH_PART.exec(part)
    if (!match) return null
    const name = match[1]!.trim()
    const items = match[2]!.length / 2
    if (name) tokens.push({ kind: 'key', name })
    else if (index > 0 || items === 0) return null
    for (let item = 0; item < items; item++) tokens.push({ kind: 'item' })
  }
  return tokens
}

function pathKey(tokens: readonly PathToken[]): string {
  return tokens.map((token) => (token.kind === 'key' ? `.${token.name}` : '[]')).join('')
}

function holderKind(token: PathToken): ContainerKind {
  return token.kind === 'key' ? 'object' : 'array'
}

function container(kind: ContainerKind): Shape {
  return kind === 'object' ? { kind, keys: new Map() } : { kind, item: null }
}

function childOf(parent: Shape, token: PathToken): Shape | null {
  if (token.kind === 'key') return parent.kind === 'object' ? (parent.keys.get(token.name) ?? null) : null
  return parent.kind === 'array' ? parent.item : null
}

function setChild(parent: Shape, token: PathToken, child: Shape) {
  if (token.kind === 'key' && parent.kind === 'object') parent.keys.set(token.name, child)
  else if (token.kind === 'item' && parent.kind === 'array') parent.item = child
}

function exampleValue(field: PayloadField): unknown {
  const text = field.example.trim()
  switch (field.type) {
    case 'string':
      return field.example === '' ? 'string' : field.example
    case 'number': {
      const value = Number(text)
      return text !== '' && Number.isFinite(value) ? value : 0
    }
    case 'boolean':
      return !/^(false|0|no)$/i.test(text)
    default:
      return null
  }
}

function toJson(shape: Shape): unknown {
  if (shape.kind === 'object') return Object.fromEntries([...shape.keys].map(([key, value]) => [key, toJson(value)]))
  if (shape.kind === 'array') return shape.item ? [toJson(shape.item)] : []
  return shape.value
}

/**
 * Builds an example body from the fields, with the example value of each field.
 *
 * A field without an example gets a value for its type: `"string"`, `0`, `true` or `null`. An array gets one item.
 * Fields that {@link fieldIssues} reports can change the result, and a later field wins.
 *
 * @returns The body, or `undefined` if no field has a valid path.
 */
export function exampleBody(fields: readonly PayloadField[]): unknown {
  let root: Shape | null = null
  for (const field of fields) {
    const tokens = parsePath(field.path)
    if (!tokens) continue
    const rootKind = holderKind(tokens[0]!)
    root ??= container(rootKind)
    if (root.kind !== rootKind) continue
    let current: Shape = root
    for (const [index, token] of tokens.entries()) {
      const existing = childOf(current, token)
      const next = tokens[index + 1]
      if (next) {
        const kind = holderKind(next)
        if (existing?.kind === kind) {
          current = existing
        } else {
          const created = container(kind)
          setChild(current, token, created)
          current = created
        }
      } else if (field.type === 'object' || field.type === 'array') {
        if (existing?.kind !== field.type) setChild(current, token, container(field.type))
      } else if (!existing || existing.kind === 'value') {
        setChild(current, token, { kind: 'value', value: exampleValue(field) })
      }
    }
  }
  return root ? toJson(root) : undefined
}

function typeOf(value: unknown): PayloadType {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'object') return 'object'
  return 'string'
}

function exampleText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function collect(path: string, samples: readonly unknown[], required: boolean, out: PayloadField[]) {
  const sample = samples.find((value) => value !== null)
  const type = sample === undefined ? 'null' : typeOf(sample)
  const objectItem = path.endsWith('[]') && type === 'object'
  if (path && !objectItem) out.push(defaultPayloadField({ path, type, required, example: exampleText(sample) }))
  if (type === 'object') {
    const records = samples.filter(isRecord)
    const keys = [...new Set(records.flatMap((record) => Object.keys(record)))]
    for (const key of keys) {
      const values = records.filter((record) => Object.hasOwn(record, key)).map((record) => record[key])
      collect(path ? `${path}.${key}` : key, values, values.length === records.length, out)
    }
  } else if (type === 'array') {
    const items = samples.filter(Array.isArray).flat()
    if (items.length > 0) collect(`${path}[]`, items, true, out)
  }
}

/**
 * Reads the fields of a body from an example of it: the path, the type and the example value of each field.
 *
 * The items of an array share their fields. A key that only some items have is not required.
 *
 * @throws PayloadJsonError If the body is not an object or an array.
 */
export function fieldsFromExample(body: unknown): PayloadField[] {
  if (typeof body !== 'object' || body === null) {
    throw new PayloadJsonError('The body must be a JSON object or array, for example {"sku": "A-1"}.')
  }
  const fields: PayloadField[] = []
  collect('', [body], true, fields)
  return fields
}

/**
 * Reads the fields of a body from an example in JSON text.
 *
 * @throws PayloadJsonError If the text is not JSON, or if the body is not an object or an array.
 */
export function fieldsFromJsonText(text: string): PayloadField[] {
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch (error) {
    throw new PayloadJsonError(`This is not valid JSON. ${error instanceof Error ? error.message : ''}`.trim())
  }
  return fieldsFromExample(body)
}

/**
 * Returns the fields read from an example, with the id, the description and the sensitive mark of the existing field
 * at each path.
 */
export function mergeFields(existing: readonly PayloadField[], read: readonly PayloadField[]): PayloadField[] {
  const byPath = new Map(existing.map((field) => [field.path.trim(), field]))
  return read.map((field) => {
    const old = byPath.get(field.path)
    if (!old) return field
    return {
      ...field,
      id: old.id,
      description: old.description,
      ...(old.sensitive ? { sensitive: old.sensitive } : {}),
    }
  })
}

const TYPE_NAMES: Record<PayloadType, string> = {
  string: 'a string',
  number: 'a number',
  boolean: 'a boolean',
  object: 'an object',
  array: 'an array',
  null: 'null',
}

/** Returns a message for each field whose path the body cannot hold, by field id. */
export function fieldIssues(fields: readonly PayloadField[]): Map<string, string> {
  const issues = new Map<string, string>()
  const byKey = new Map<string, PayloadField>()
  const parsed: [PayloadField, PathToken[]][] = []
  let rootKind: ContainerKind | null = null
  for (const field of fields) {
    if (!field.path.trim()) {
      issues.set(field.id, 'Give the field a name.')
      continue
    }
    const tokens = parsePath(field.path)
    if (!tokens) {
      issues.set(field.id, 'Put dots between names, and [] after an array, for example items[].sku.')
      continue
    }
    const key = pathKey(tokens)
    if (byKey.has(key)) {
      issues.set(field.id, 'Another field has this name.')
      continue
    }
    byKey.set(key, field)
    const kind = holderKind(tokens[0]!)
    rootKind ??= kind
    if (kind !== rootKind) {
      issues.set(
        field.id,
        kind === 'array'
          ? 'The body is an object, so this field cannot start with [].'
          : 'The body is an array, so this field must start with [].',
      )
      continue
    }
    parsed.push([field, tokens])
  }
  for (const [field, tokens] of parsed) {
    for (let length = 1; length < tokens.length; length++) {
      const parent = byKey.get(pathKey(tokens.slice(0, length)))
      const needs = holderKind(tokens[length]!)
      if (parent && parent.type !== needs) {
        issues.set(
          field.id,
          `“${parent.path.trim()}” is ${TYPE_NAMES[parent.type]}. Make it ${TYPE_NAMES[needs]} to hold this field.`,
        )
        break
      }
    }
  }
  return issues
}

/**
 * Returns the example body of a payload as JSON text.
 *
 * @param indent - The number of spaces for each level. Without it, the text has no line breaks.
 * @returns The text, or an empty string if the payload has no field with a valid path.
 */
export function payloadJson(payload: Payload | undefined, indent?: number): string {
  if (!payload) return ''
  const body = exampleBody(payload.fields)
  return body === undefined ? '' : JSON.stringify(body, null, indent)
}

/**
 * Returns the body that the log line of an edge step shows, as compact JSON.
 *
 * @param reversed - True if the token moves from the edge target to the edge source, so the response body shows.
 * @returns The text, or an empty string if the edge has no such body.
 */
export function stepBody(data: EdgeData | undefined, reversed: boolean): string {
  return payloadJson(reversed ? data?.response : data?.request)
}

/** Returns the edge data with the fields as the request or the response body. No fields remove that body. */
export function withPayload(data: EdgeData, part: PayloadPart, fields: PayloadField[]): EdgeData {
  const { request, response, ...rest } = data
  const bodies = { request, response, [part]: fields.length > 0 ? { fields } : undefined }
  return {
    ...rest,
    ...(bodies.request ? { request: bodies.request } : {}),
    ...(bodies.response ? { response: bodies.response } : {}),
  }
}
