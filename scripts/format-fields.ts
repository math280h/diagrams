export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
type JsonObject = { [key: string]: Json }
type Key = string | number

/** The part of JSON Schema that `z.toJSONSchema` writes for the diagram format. */
export interface Schema {
  type?: string | string[]
  properties?: Record<string, Schema>
  required?: string[]
  additionalProperties?: Schema | boolean
  items?: Schema
  enum?: Json[]
  const?: Json
  anyOf?: Schema[]
  oneOf?: Schema[]
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  minItems?: number
  minLength?: number
}

/**
 * A place in a schema that a sample can fill.
 *
 * - `property`: the object at `at` holds the property `key`.
 * - `value`: the value at `at` is `literal`.
 * - `branch`: the value at `at` matches the branch `schema` of a union.
 * - `item`: the array at `at` holds an item.
 * - `entry`: the record at `at` holds an entry.
 */
export interface Slot {
  name: string
  kind: 'property' | 'value' | 'branch' | 'item' | 'entry'
  at: string
  key?: string
  literal?: Json
  schema?: Schema
}

const REFERENCE_KINDS = new Set(['node', 'edge', 'flow'])
const ROOT = '[]'
const MAX_ROUNDS = 8
const HOSTS_PER_SLOT = 4

const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const unionOf = (schema: Schema) => schema.anyOf ?? schema.oneOf ?? null

const typesOf = (schema: Schema) => (schema.type === undefined ? [] : [schema.type].flat())

function typeFits(type: string, value: Json): boolean {
  if (type === 'null') return value === null
  if (type === 'integer') return Number.isInteger(value)
  if (type === 'array') return Array.isArray(value)
  if (type === 'object') return isObject(value)
  return typeof value === type
}

function fits(schema: Schema, value: Json): boolean {
  const union = unionOf(schema)
  if (union) return union.some((branch) => fits(branch, value))
  if (schema.const !== undefined) return JSON.stringify(schema.const) === JSON.stringify(value)
  if (schema.enum) return schema.enum.includes(value)
  const types = typesOf(schema)
  if (types.length > 0 && !types.some((type) => typeFits(type, value))) return false
  if (!isObject(value)) return true
  if ((schema.required ?? []).some((key) => !(key in value))) return false
  return Object.entries(schema.properties ?? {}).every(
    ([key, property]) =>
      !(key in value) || (property.const === undefined && !property.enum) || fits(property, value[key] as Json),
  )
}

function branchLabels(branches: Schema[]): string[] {
  const labels = branches.map((branch) => {
    const constants = Object.entries(branch.properties ?? {}).filter(([, property]) => property.const !== undefined)
    if (constants.length > 0) {
      return constants.map(([key, property]) => `${key}=${JSON.stringify(property.const)}`).join(',')
    }
    if (branch.const !== undefined) return JSON.stringify(branch.const)
    return typesOf(branch).join('/') || 'any'
  })
  return labels.map((label, index) =>
    labels.indexOf(label) === labels.lastIndexOf(label) ? label : `${label}#${index}`,
  )
}

const isFreeBoolean = (schema: Schema) =>
  typesOf(schema).includes('boolean') && schema.const === undefined && !schema.enum

/** Lists the places in a schema that a sample can fill. Each boolean has two places: `true` and `false`. */
export function schemaSlots(schema: Schema): Slot[] {
  const slots: Slot[] = []
  const visit = (node: Schema, path: string) => {
    const union = unionOf(node)
    if (union) {
      const labels = branchLabels(union)
      union.forEach((branch, index) => {
        if (union.length === 1) return visit(branch, path)
        const name = `${path}|${labels[index]}`
        slots.push({ name, kind: 'branch', at: path, schema: branch })
        visit(branch, name)
      })
      return
    }
    if (node.enum && node.enum.length > 1) {
      for (const literal of node.enum)
        slots.push({ name: `${path}=${JSON.stringify(literal)}`, kind: 'value', at: path, literal })
    }
    if (isFreeBoolean(node)) {
      for (const literal of [true, false]) slots.push({ name: `${path}=${literal}`, kind: 'value', at: path, literal })
    }
    for (const [key, property] of Object.entries(node.properties ?? {})) {
      slots.push({ name: `${path}.${key}`, kind: 'property', at: path, key, schema: property })
      visit(property, `${path}.${key}`)
    }
    if (node.items) {
      slots.push({ name: `${path}[]`, kind: 'item', at: path, schema: node.items })
      visit(node.items, `${path}[]`)
    }
    if (typeof node.additionalProperties === 'object') {
      slots.push({ name: `${path}{}`, kind: 'entry', at: path, schema: node.additionalProperties })
      visit(node.additionalProperties, `${path}{}`)
    }
  }
  visit(schema, '')
  return slots.toSorted((a, b) => a.name.localeCompare(b.name))
}

interface Location {
  valueIndex: number
  keys: Key[]
}

function walk(schema: Schema, values: readonly Json[], visit: (path: string, location: Location) => void) {
  const step = (node: Schema, value: Json, path: string, location: Location) => {
    const union = unionOf(node)
    if (union) {
      const index = union.findIndex((branch) => fits(branch, value))
      if (index === -1) return
      const branchPath = union.length > 1 ? `${path}|${branchLabels(union)[index]}` : path
      if (union.length > 1) visit(branchPath, location)
      step(union[index]!, value, branchPath, location)
      return
    }
    if (node.enum && node.enum.length > 1) visit(`${path}=${JSON.stringify(value)}`, location)
    if (typeof value === 'boolean' && isFreeBoolean(node)) visit(`${path}=${value}`, location)
    if (isObject(value)) {
      const properties = node.properties ?? {}
      for (const [key, property] of Object.entries(properties)) {
        if (!(key in value)) continue
        const child = { valueIndex: location.valueIndex, keys: [...location.keys, key] }
        visit(`${path}.${key}`, child)
        step(property, value[key] as Json, `${path}.${key}`, child)
      }
      if (typeof node.additionalProperties === 'object') {
        for (const [key, entry] of Object.entries(value)) {
          if (key in properties) continue
          const child = { valueIndex: location.valueIndex, keys: [...location.keys, key] }
          visit(`${path}{}`, child)
          step(node.additionalProperties, entry, `${path}{}`, child)
        }
      }
    }
    if (Array.isArray(value) && node.items) {
      const items = node.items
      value.forEach((item, index) => {
        const child = { valueIndex: location.valueIndex, keys: [...location.keys, index] }
        visit(`${path}[]`, child)
        step(items, item, `${path}[]`, child)
      })
    }
  }
  values.forEach((value, index) => {
    visit('', { valueIndex: index, keys: [] })
    step(schema, value, '', { valueIndex: index, keys: [] })
  })
}

/** Returns the names of the slots of `schema` that no value fills. */
export function missingSlots(schema: Schema, values: readonly Json[]): string[] {
  const reached = new Set<string>()
  walk(schema, values, (path) => reached.add(path))
  return schemaSlots(schema)
    .map((slot) => slot.name)
    .filter((name) => !reached.has(name))
}

function numberFor(schema: Schema): number {
  let value = 1
  if (schema.minimum !== undefined) value = Math.max(value, schema.minimum)
  if (schema.exclusiveMinimum !== undefined) value = Math.max(value, schema.exclusiveMinimum + 1)
  if (schema.maximum !== undefined) value = Math.min(value, schema.maximum)
  if (schema.exclusiveMaximum !== undefined) value = Math.min(value, schema.exclusiveMaximum / 2)
  return typesOf(schema).includes('integer') ? Math.round(value) : value
}

/** Builds a value that fits a schema, with every optional property and one item in each array. */
export function sampleValue(schema: Schema, newId: () => string): Json {
  const union = unionOf(schema)
  if (union) return sampleValue(union.find((branch) => !typesOf(branch).includes('null')) ?? union[0]!, newId)
  if (schema.const !== undefined) return schema.const
  if (schema.enum) return schema.enum[0] ?? null
  const types = typesOf(schema)
  const type = types.find((candidate) => candidate !== 'null') ?? types[0]
  if (type === 'null') return null
  if (type === 'boolean') return true
  if (type === 'number' || type === 'integer') return numberFor(schema)
  if (type === 'string') return 'Sample'.padEnd(schema.minLength ?? 0, '.')
  if (type === 'array') {
    const items = schema.items
    return items ? Array.from({ length: Math.max(1, schema.minItems ?? 0) }, () => sampleValue(items, newId)) : []
  }
  const value: JsonObject = {}
  for (const [key, property] of Object.entries(schema.properties ?? {})) {
    const ownId = key === 'id' && property.const === undefined && typesOf(property).includes('string')
    value[key] = ownId ? newId() : sampleValue(property, newId)
  }
  return value
}

function getAt(root: Json, keys: readonly Key[]): Json | undefined {
  let value: Json | undefined = root
  for (const key of keys) {
    if (Array.isArray(value) && typeof key === 'number') value = value[key]
    else if (isObject(value) && typeof key === 'string') value = value[key]
    else return undefined
  }
  return value
}

const isReference = (value: JsonObject) => typeof value.kind === 'string' && REFERENCE_KINDS.has(value.kind)

function renewIds(part: Json, newId: (old: string) => string): Json {
  const renamed = new Map<string, string>()
  const collect = (value: Json) => {
    if (Array.isArray(value)) value.forEach(collect)
    else if (isObject(value)) {
      if (typeof value.id === 'string' && value.id !== '' && !isReference(value)) renamed.set(value.id, newId(value.id))
      Object.values(value).forEach(collect)
    }
  }
  collect(part)
  const rename = (value: Json): Json => {
    if (typeof value === 'string') return renamed.get(value) ?? value
    if (Array.isArray(value)) return value.map(rename)
    if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, rename(child)]))
    return value
  }
  return rename(part)
}

const objects = (value: Json | undefined) => (Array.isArray(value) ? value.filter(isObject) : [])

function repairReferences(diagram: Json) {
  if (!isObject(diagram)) return
  const nodes = objects(diagram.nodes)
  const edges = objects(diagram.edges)
  const ids = (list: JsonObject[]) => list.map((item) => item.id).filter((id): id is string => typeof id === 'string')
  const nodeIds = ids(nodes)
  const edgeIds = ids(edges)
  const groupIds = ids(nodes.filter((node) => node.type === 'group'))
  for (const node of nodes) {
    if (node.parentId === undefined || node.parentId === null) continue
    if (groupIds.includes(node.parentId as string) && node.parentId !== node.id) continue
    const group = groupIds.find((id) => id !== node.id)
    if (group) node.parentId = group
    else delete node.parentId
  }
  for (const edge of edges) {
    if (!nodeIds.includes(edge.source as string) && nodeIds[0]) edge.source = nodeIds[0]
    if (!nodeIds.includes(edge.target as string) && nodeIds[0]) edge.target = nodeIds[1] ?? nodeIds[0]
  }
  const fixTargets = (value: Json) => {
    if (Array.isArray(value)) value.forEach(fixTargets)
    else if (isObject(value)) {
      if (value.kind === 'node' && !nodeIds.includes(value.id as string) && nodeIds[0]) value.id = nodeIds[0]
      if (value.kind === 'edge' && !edgeIds.includes(value.id as string) && edgeIds[0]) value.id = edgeIds[0]
      Object.values(value).forEach(fixTargets)
    }
  }
  for (const flow of objects(diagram.flows)) {
    fixTargets(flow)
    const stepIds = ids(objects(flow.steps))
    for (const path of objects(flow.paths)) {
      if (typeof path.fromStep === 'string' && !stepIds.includes(path.fromStep) && stepIds[0])
        path.fromStep = stepIds[0]
      if (typeof path.rejoinStep === 'string' && !stepIds.includes(path.rejoinStep))
        path.rejoinStep = stepIds.at(-1) ?? null
    }
  }
}

export interface FieldSamples {
  /** Changed copies of the base diagrams, as `accepts` returned them. */
  diagrams: Json[]
  /** The names of the slots that no accepted change could fill. */
  missing: string[]
}

interface Bench {
  value: Json
  changed: boolean
  replacedByCopy: Map<string, Set<string>>
}

/**
 * Builds diagrams that, with the base diagrams, fill every slot of the schema. A change that adds a property, an item
 * or an entry goes into a copy of a base diagram. A change that replaces a value goes into a copy of its array item,
 * or of the whole diagram. The base values stay.
 *
 * @param bases - Diagrams of the format, for example the templates of its sample file.
 * @param accepts - Returns the diagram as the app of the format stores it, or null if that app refuses it.
 */
export function fieldSamples(
  schema: Schema,
  bases: readonly Json[],
  accepts: (diagram: Json) => Json | null,
): FieldSamples {
  let counter = 0
  const newId = (old = 'x_') => {
    const prefix = old.includes('_') ? old.slice(0, old.indexOf('_')) : 'x'
    return `${prefix}_f${(counter++).toString(36).padStart(4, '0')}`
  }
  const slots = schemaSlots(schema)
  const bySize = bases.toSorted((a, b) => JSON.stringify(a).length - JSON.stringify(b).length)
  const benches: Bench[] = bySize.map((base) => ({
    value: structuredClone(base),
    changed: false,
    replacedByCopy: new Map(),
  }))
  const values = () => benches.map((bench) => bench.value)

  const reachedPaths = () => {
    const found = new Set<string>()
    walk(schema, values(), (path) => found.add(path))
    return found
  }

  const locate = (path: string) => {
    const found: { bench: Bench; keys: Key[] }[] = []
    walk(schema, values(), (reached, location) => {
      if (reached === path) found.push({ bench: benches[location.valueIndex]!, keys: location.keys })
    })
    return found
  }

  let undo = () => {}
  const commit = (bench: Bench, write: (root: Json) => Json) => {
    const before = structuredClone(bench.value)
    const replacedBefore = new Map([...bench.replacedByCopy].map(([key, written]) => [key, new Set(written)]))
    const changedBefore = bench.changed
    const restore = () => {
      bench.value = before
      bench.replacedByCopy = replacedBefore
      bench.changed = changedBefore
    }
    bench.value = write(bench.value)
    repairReferences(bench.value)
    if (accepts(bench.value) !== null) {
      bench.changed = true
      undo = restore
      return true
    }
    restore()
    return false
  }

  const variants: Bench[] = []
  const replaceInVariant = (host: Bench, keys: Key[], next: Json) => {
    const written = JSON.stringify(keys)
    const holds = (value: Json) => isObject(getAt(value, keys.slice(0, -1)))
    let variant = variants.find(
      (candidate) => !candidate.replacedByCopy.get(ROOT)?.has(written) && holds(candidate.value),
    )
    const created = !variant
    if (!variant) {
      const source = bySize.find(holds) ?? host.value
      variant = {
        value: renewIds(structuredClone(source), newId),
        changed: false,
        replacedByCopy: new Map([[ROOT, new Set()]]),
      }
      benches.push(variant)
      variants.push(variant)
    }
    const done = commit(variant, (root) => {
      ;(getAt(root, keys.slice(0, -1)) as JsonObject)[keys.at(-1) as string] = next
      return root
    })
    if (done) variant.replacedByCopy.get(ROOT)!.add(written)
    else if (created) {
      benches.pop()
      variants.pop()
    }
    return done
  }

  const replaceAt = (bench: Bench, keys: Key[], next: Json) => {
    const itemIndex = keys.findLastIndex((key) => typeof key === 'number')
    if (itemIndex === -1) return keys.length > 0 && replaceInVariant(bench, keys, next)
    return commit(bench, (root) => {
      const itemKeys = keys.slice(0, itemIndex + 1)
      const inside = JSON.stringify(keys.slice(itemIndex + 1))
      let target = keys
      const reuse = bench.replacedByCopy.get(JSON.stringify(itemKeys))
      if (!reuse || reuse.has(inside)) {
        const array = getAt(root, keys.slice(0, itemIndex)) as Json[]
        array.push(renewIds(structuredClone(array[keys[itemIndex] as number]!), newId))
        target = [...keys.slice(0, itemIndex), array.length - 1, ...keys.slice(itemIndex + 1)]
      }
      const copyKey = JSON.stringify(target.slice(0, itemIndex + 1))
      const written = bench.replacedByCopy.get(copyKey) ?? new Set<string>()
      written.add(inside)
      bench.replacedByCopy.set(copyKey, written)
      const parent = getAt(root, target.slice(0, -1))
      const last = target.at(-1)!
      if (Array.isArray(parent) && typeof last === 'number') parent[last] = next
      else if (isObject(parent) && typeof last === 'string') parent[last] = next
      return root
    })
  }

  const addItems = (item: Slot) => {
    const arrays = new Map<Bench, Key[]>()
    if (item.kind === 'item') for (const host of locate(item.at)) arrays.set(host.bench, host.keys)
    else for (const host of locate(item.at)) arrays.set(host.bench, host.keys.slice(0, -1))
    let added = false
    for (const [bench, keys] of arrays) {
      const pushed = commit(bench, (root) => {
        ;(getAt(root, keys) as Json[]).push(sampleValue(item.schema!, newId))
        return root
      })
      added = pushed || added
    }
    return added
  }
  const itemSlot = (path: string) =>
    slots.find(
      (candidate) =>
        candidate.name === path &&
        (candidate.kind === 'item' || (candidate.kind === 'branch' && candidate.at.endsWith('[]'))),
    )

  const fill = (slot: Slot): boolean => {
    if (slot.kind === 'branch' && slot.at.endsWith('[]')) return addItems(slot) && reachedPaths().has(slot.name)
    if (fillAtHosts(slot)) return true
    const item = slot.kind === 'property' ? itemSlot(slot.at) : undefined
    return item !== undefined && addItems(item) && reachedPaths().has(slot.name)
  }

  const fillAtHosts = (slot: Slot): boolean => {
    for (const host of locate(slot.at).slice(0, HOSTS_PER_SLOT)) {
      const { bench, keys } = host
      const current = getAt(bench.value, keys)
      let done = false
      if (slot.kind === 'property' && isObject(current)) {
        done = commit(bench, (root) => {
          ;(getAt(root, keys) as JsonObject)[slot.key!] = sampleValue(slot.schema!, newId)
          return root
        })
      } else if (slot.kind === 'item' && Array.isArray(current)) {
        done = commit(bench, (root) => {
          ;(getAt(root, keys) as Json[]).push(sampleValue(slot.schema!, newId))
          return root
        })
      } else if (slot.kind === 'entry' && isObject(current)) {
        done = commit(bench, (root) => {
          ;(getAt(root, keys) as JsonObject)[`sample${counter++}`] = sampleValue(slot.schema!, newId)
          return root
        })
      } else if (slot.kind === 'branch') done = replaceAt(bench, keys, sampleValue(slot.schema!, newId))
      else if (slot.kind === 'value') done = replaceAt(bench, keys, slot.literal!)
      if (done && reachedPaths().has(slot.name)) return true
      if (done) undo()
    }
    return false
  }

  let reached = reachedPaths()
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const before = reached.size
    for (const slot of slots) {
      if (!reached.has(slot.name) && fill(slot)) reached = reachedPaths()
    }
    if (reached.size === before) break
  }
  const diagrams = benches
    .filter((bench) => bench.changed)
    .map((bench) => accepts(bench.value))
    .filter((value): value is Json => value !== null)
  return { diagrams, missing: missingSlots(schema, [...bases, ...diagrams]) }
}
