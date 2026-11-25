import type { Diagram, DiagramTheme, Flow, StoredEdge, StoredNode } from './schema'

export type MergeSide = 'mine' | 'theirs'

/**
 * The choice of the user for a conflict: one side, a merge of the items of both sides of a list, or a text that the
 * user types.
 */
export type MergeChoice = { kind: 'mine' } | { kind: 'theirs' } | { kind: 'both' } | { kind: 'custom'; value: string }
export type MergeChoiceKind = MergeChoice['kind']

/** Where a node, an edge or a flow of a merge result changed since the base. */
export type MergeOrigin = MergeSide | 'both' | 'conflict'

export type MergeConflictKind = 'node' | 'edge' | 'flow' | 'name' | 'theme'

/**
 * A field that the two sides changed in different ways, or an element that one side deleted and the other side
 * changed, or that both sides added in different ways.
 */
export interface MergeConflict {
  /**
   * The key of the choice. A field has `node:<id>:<field>`, `edge:<id>:<field>`, `flow:<id>:<field>`, `name` or
   * `theme:<field>`, for example `node:n_1:data.title`. A whole element has `node:<id>`, `edge:<id>` or `flow:<id>`.
   */
  key: string
  kind: MergeConflictKind
  /** The id of the node, edge or flow, or an empty string for the name and the theme. */
  id: string
  /** The path of the field in the element, for example `position` or `data.details.owner`, or empty for an element. */
  field: string
  /** The name of the field in words, for example `Title`. */
  label: string
  base: unknown
  mine: unknown
  theirs: unknown
  /** The choices that apply. `both` applies to lists, `custom` to text fields. */
  choices: readonly MergeChoiceKind[]
  /** The side that deleted the element, for a conflict of a whole element. */
  deletedBy?: MergeSide
}

export interface MergeResult {
  /** The merged diagram. A conflict without a choice that applies takes the side `mine`. */
  diagram: Diagram
  conflicts: MergeConflict[]
  /** The origin of each changed node, edge and flow of the result, by `node:<id>`, `edge:<id>` or `flow:<id>`. */
  origins: ReadonlyMap<string, MergeOrigin>
  /** The edges that the result does not have, because their source or target node is not in the result. */
  droppedEdges: StoredEdge[]
  /** The ids of the nodes that the result moves to the top level, because their parent is not in the result. */
  detachedNodes: string[]
}

type Fields = Record<string, unknown>
type Element = StoredNode | StoredEdge
type Choices = ReadonlyMap<string, MergeChoice>

const TEXT_FIELDS = new Set([
  'title',
  'label',
  'detail',
  'text',
  'name',
  'description',
  'owner',
  'badge',
  'meterText',
  'caption',
])

const FIELD_LABELS: Record<string, string> = {
  position: 'Position',
  width: 'Width',
  height: 'Height',
  parentId: 'Boundary',
  zIndex: 'Order',
  source: 'Start node',
  target: 'End node',
  sourceHandle: 'Start side',
  targetHandle: 'End side',
  data: 'Kind and content',
  'data.color': 'Colour',
  'data.form': 'Kind',
  'data.kind': 'Boundary kind',
  'data.size': 'Text size',
  'data.align': 'Alignment',
  'data.mono': 'Monospace',
  'data.details.links': 'Links',
  'data.path': 'Line shape',
  'data.stroke': 'Line style',
  'data.width': 'Line width',
  'data.markerStart': 'Start marker',
  'data.markerEnd': 'End marker',
  'data.route': 'Route',
  'data.bends': 'Route',
  'data.request': 'Request body',
  'data.request.fields': 'Request body',
  'data.response': 'Response body',
  'data.response.fields': 'Response body',
  'data.noReply': 'No reply',
  cameraStyle: 'Camera',
  fonts: 'Fonts',
  snap: 'Snap to grid',
  boundaryColors: 'Boundary colours',
  protocolColors: 'Protocol colours',
  routeAround: 'Route around nodes',
}

/** Returns the name of a field in words, for example `Meter text` for `data.meterText`. */
export function fieldLabel(field: string): string {
  const known = FIELD_LABELS[field]
  if (known) return known
  const words = field
    .split('.')
    .filter((part) => part !== 'data')
    .join(' ')
    .replaceAll(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]))
  }
  const left = a as Fields
  const right = b as Fields
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const key of keys) if (!deepEqual(left[key], right[key])) return false
  return true
}

function withoutMeasured<T>(value: T): T {
  if (typeof value !== 'object' || value === null || !('measured' in value)) return value
  const { measured: _measured, ...rest } = value
  return rest as T
}

function sameContent(a: unknown, b: unknown) {
  return deepEqual(withoutMeasured(a), withoutMeasured(b))
}

function isPlainObject(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasId(item: unknown): item is { id: string } {
  return isPlainObject(item) && typeof item.id === 'string'
}

function isPrimitive(item: unknown) {
  return item === null || (typeof item !== 'object' && typeof item !== 'function')
}

function listKind(lists: readonly unknown[][]): 'ids' | 'values' | null {
  const items = lists.flat()
  if (items.every(hasId)) return 'ids'
  if (items.every(isPrimitive)) return 'values'
  return null
}

/**
 * Merges the items of two lists that both started from `base`.
 *
 * Items with ids keep the order of `base`, then the items that `mine` added, then the items that `theirs` added. An
 * item that one side deleted and the other side did not change goes away. An item that both sides changed takes
 * `mine`. A list of plain values gives the values of `mine` and then the other values of `theirs`.
 *
 * @returns The merged list, or `null` if the lists hold objects without ids.
 */
export function mergeLists(base: unknown, mine: readonly unknown[], theirs: readonly unknown[]): unknown[] | null {
  const from = Array.isArray(base) ? (base as unknown[]) : []
  const kind = listKind([from, [...mine], [...theirs]])
  if (kind === 'values') return [...mine, ...theirs.filter((item) => !mine.includes(item))]
  if (kind !== 'ids') return null
  const byId = (list: readonly unknown[]) => new Map((list as { id: string }[]).map((item) => [item.id, item]))
  const baseById = byId(from)
  const mineById = byId(mine)
  const theirsById = byId(theirs)
  const ids = [
    ...baseById.keys(),
    ...[...mineById.keys()].filter((id) => !baseById.has(id)),
    ...[...theirsById.keys()].filter((id) => !baseById.has(id) && !mineById.has(id)),
  ]
  return ids.flatMap((id) => {
    const b = baseById.get(id)
    const m = mineById.get(id)
    const t = theirsById.get(id)
    if (!b) return [m ?? t]
    if (!m && !t) return []
    if (!m) return deepEqual(b, t) ? [] : [t]
    if (!t) return deepEqual(b, m) ? [] : [m]
    return [deepEqual(m, b) ? t : m]
  })
}

function choiceKinds(field: string, mine: unknown, theirs: unknown, base: unknown): MergeChoiceKind[] {
  const kinds: MergeChoiceKind[] = ['mine', 'theirs']
  if (Array.isArray(mine) && Array.isArray(theirs) && mergeLists(base, mine, theirs) !== null) kinds.push('both')
  const last = field.split('.').at(-1) ?? ''
  if (typeof mine === 'string' && typeof theirs === 'string' && TEXT_FIELDS.has(last)) kinds.push('custom')
  return kinds
}

/** Returns true if the choice applies to the conflict. */
export function allowsChoice(conflict: Pick<MergeConflict, 'choices'>, choice: MergeChoice): boolean {
  return conflict.choices.includes(choice.kind)
}

function resolve(conflict: MergeConflict, choice: MergeChoice | undefined): unknown {
  if (!choice || !allowsChoice(conflict, choice)) return conflict.mine
  switch (choice.kind) {
    case 'mine':
      return conflict.mine
    case 'theirs':
      return conflict.theirs
    case 'both':
      return mergeLists(conflict.base, conflict.mine as unknown[], conflict.theirs as unknown[])
    case 'custom':
      return choice.value
  }
}

interface Scope {
  kind: MergeConflictKind
  id: string
  keyOf: (field: string) => string
  choices: Choices
  conflicts: MergeConflict[]
}

interface FieldMerge {
  value: Fields
  fromMine: boolean
  fromTheirs: boolean
  conflicted: boolean
}

function mergeFields(
  scope: Scope,
  base: Fields,
  mine: Fields,
  theirs: Fields,
  prefix = '',
  nested = false,
): FieldMerge {
  const result: FieldMerge = { value: {}, fromMine: false, fromTheirs: false, conflicted: false }
  for (const key of new Set([...Object.keys(mine), ...Object.keys(theirs), ...Object.keys(base)])) {
    const field = `${prefix}${key}`
    const [b, m, t] = [base[key], mine[key], theirs[key]]
    const mineChanged = !deepEqual(b, m)
    const theirsChanged = !deepEqual(b, t)
    let value = m
    if (theirsChanged && !mineChanged) {
      value = t
      result.fromTheirs = true
    } else if (mineChanged && theirsChanged && !deepEqual(m, t)) {
      if (nested && isPlainObject(b) && isPlainObject(m) && isPlainObject(t)) {
        const inner = mergeFields(scope, b, m, t, `${field}.`, true)
        value = inner.value
        result.conflicted = result.conflicted || inner.conflicted
        result.fromMine = result.fromMine || inner.fromMine
        result.fromTheirs = result.fromTheirs || inner.fromTheirs
      } else {
        const conflict: MergeConflict = {
          key: scope.keyOf(field),
          kind: scope.kind,
          id: scope.id,
          field,
          label: scope.kind === 'name' ? 'Diagram name' : fieldLabel(field),
          base: b,
          mine: m,
          theirs: t,
          choices: choiceKinds(field, m, t, b),
        }
        scope.conflicts.push(conflict)
        value = resolve(conflict, scope.choices.get(conflict.key))
        result.conflicted = true
      }
    } else if (mineChanged) {
      result.fromMine = true
      result.fromTheirs = result.fromTheirs || theirsChanged
    }
    if (value !== undefined) result.value[key] = value
  }
  return result
}

function originOf(merge: Pick<FieldMerge, 'conflicted' | 'fromMine' | 'fromTheirs'>): MergeOrigin | undefined {
  if (merge.conflicted) return 'conflict'
  if (merge.fromMine && merge.fromTheirs) return 'both'
  if (merge.fromMine) return 'mine'
  return merge.fromTheirs ? 'theirs' : undefined
}

interface Merged<T> {
  item: T
  origin: MergeOrigin | undefined
}

function parts(element: Element) {
  const { type, data, measured: _measured, ...fields } = element as StoredNode
  return { fields: fields as Fields, kind: { type, data } as Fields }
}

function mergeElement<T extends Element>(scope: Scope, base: T, mine: T, theirs: T): Merged<T> {
  if (sameContent(base, theirs) || sameContent(mine, theirs)) {
    const fromTheirs = !sameContent(base, theirs)
    return { item: mine, origin: originOf({ conflicted: false, fromMine: !sameContent(base, mine), fromTheirs }) }
  }
  const [b, m, t] = [parts(base), parts(mine), parts(theirs)]
  const fields = mergeFields(scope, b.fields, m.fields, t.fields)
  const sameType = base.type === mine.type && base.type === theirs.type
  const content = sameType
    ? mergeFields(scope, b.kind, m.kind, t.kind, '', true)
    : mergeFields(scope, { data: b.kind }, { data: m.kind }, { data: t.kind })
  const kind = sameType ? content.value : (content.value.data as Fields)
  const { measured } = mine as StoredNode
  const item = { ...fields.value, ...kind, ...(measured ? { measured } : {}) }
  const merged = {
    conflicted: fields.conflicted || content.conflicted,
    fromMine: fields.fromMine || content.fromMine,
    fromTheirs: fields.fromTheirs || content.fromTheirs,
  }
  return { item: item as unknown as T, origin: originOf(merged) }
}

function mergeFlow(scope: Scope, base: Flow, mine: Flow, theirs: Flow): Merged<Flow> {
  const merged = mergeFields(scope, base, mine, theirs)
  return { item: merged.value as unknown as Flow, origin: originOf(merged) }
}

function mergeCollection<T extends { id: string }>(
  kind: 'node' | 'edge' | 'flow',
  [base, mine, theirs]: readonly [readonly T[], readonly T[], readonly T[]],
  choices: Choices,
  conflicts: MergeConflict[],
  mergeCommon: (scope: Scope, base: T, mine: T, theirs: T) => Merged<T>,
) {
  const baseById = new Map(base.map((item) => [item.id, item]))
  const mineById = new Map(mine.map((item) => [item.id, item]))
  const theirsById = new Map(theirs.map((item) => [item.id, item]))
  const result = new Map<string, T>()
  const origins = new Map<string, MergeOrigin>()

  for (const id of new Set([...mineById.keys(), ...theirsById.keys(), ...baseById.keys()])) {
    const key = `${kind}:${id}`
    const b = baseById.get(id)
    const m = mineById.get(id)
    const t = theirsById.get(id)
    const elementConflict = (deletedBy?: MergeSide) => {
      const conflict: MergeConflict = {
        key,
        kind,
        id,
        field: '',
        label: deletedBy ? 'Deleted' : 'Added on both sides',
        base: b,
        mine: m,
        theirs: t,
        choices: ['mine', 'theirs'],
        ...(deletedBy ? { deletedBy } : {}),
      }
      conflicts.push(conflict)
      origins.set(key, 'conflict')
      return resolve(conflict, choices.get(key)) as T | undefined
    }
    if (!b) {
      const chosen = m && t && !sameContent(m, t) ? elementConflict() : (m ?? t)
      if (!origins.has(key)) origins.set(key, m && t ? 'both' : m ? 'mine' : 'theirs')
      if (chosen) result.set(id, chosen)
    } else if (!m || !t) {
      const kept = m ?? t
      if (!kept || sameContent(b, kept)) continue
      const chosen = elementConflict(m ? 'theirs' : 'mine')
      if (chosen) result.set(id, chosen)
    } else {
      const scope: Scope = { kind, id, keyOf: (field) => `${key}:${field}`, choices, conflicts }
      const merged = mergeCommon(scope, b, m, t)
      if (merged.origin) origins.set(key, merged.origin)
      result.set(id, merged.item)
    }
  }

  const order = [...mineById.keys(), ...[...theirsById.keys()].filter((id) => !mineById.has(id))]
  return { items: order.flatMap((id) => result.get(id) ?? []), origins }
}

function canvasPosition(node: StoredNode, maps: readonly ReadonlyMap<string, StoredNode>[]) {
  let { x, y } = node.position
  let parentId = node.parentId
  const seen = new Set([node.id])
  while (parentId !== undefined && !seen.has(parentId)) {
    seen.add(parentId)
    const id = parentId
    const parent = maps.map((map) => map.get(id)).find((found) => found !== undefined)
    if (!parent) break
    x += parent.position.x
    y += parent.position.y
    parentId = parent.parentId
  }
  return { x, y }
}

function detachOrphans(nodes: readonly StoredNode[], sides: readonly ReadonlyMap<string, StoredNode>[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const detached: string[] = []
  const onLoop = (node: StoredNode) => {
    const seen = new Set([node.id])
    let parentId = node.parentId
    while (parentId !== undefined) {
      if (parentId === node.id) return true
      if (seen.has(parentId)) return false
      seen.add(parentId)
      parentId = byId.get(parentId)?.parentId
    }
    return false
  }
  for (const node of nodes) {
    const current = byId.get(node.id)!
    if (current.parentId === undefined) continue
    const parentKept = byId.has(current.parentId)
    if (parentKept && !onLoop(current)) continue
    const { parentId: _parentId, ...rest } = current
    const position = parentKept ? current.position : canvasPosition(current, [byId, ...sides])
    byId.set(node.id, { ...rest, position })
    detached.push(node.id)
  }
  return { nodes: nodes.map((node) => byId.get(node.id)!), detached }
}

function parentsFirst(nodes: readonly StoredNode[]): StoredNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const placed = new Set<string>()
  const order: StoredNode[] = []
  const place = (node: StoredNode) => {
    if (placed.has(node.id)) return
    placed.add(node.id)
    const parent = node.parentId === undefined ? undefined : byId.get(node.parentId)
    if (parent) place(parent)
    order.push(node)
  }
  for (const node of nodes) place(node)
  return order
}

/**
 * Returns the keys of the nodes and edges that a side changed, added or deleted since the base, for example
 * `node:n_1`. A change of only the measured size does not count.
 */
export function changedElements(base: Diagram, side: Diagram): Set<string> {
  const changed = new Set<string>()
  const compare = (kind: 'node' | 'edge', before: readonly Element[], after: readonly Element[]) => {
    const old = new Map(before.map((item) => [item.id, item]))
    const now = new Map(after.map((item) => [item.id, item]))
    for (const id of new Set([...old.keys(), ...now.keys()])) {
      if (!sameContent(old.get(id), now.get(id))) changed.add(`${kind}:${id}`)
    }
  }
  compare('node', base.nodes, side.nodes)
  compare('edge', base.edges, side.edges)
  return changed
}

/**
 * Merges two versions of a diagram that both started from `base`, for example the open diagram and the version that
 * changed on disk.
 *
 * Nodes, edges and flows merge field by field. Node and edge data merges data field by data field, also inside the
 * details, the traffic and the bodies. A change on one side takes that side, and the same change on both sides
 * counts once. A field that the two sides changed in different ways is a conflict of its own. An element that one
 * side deleted and the other side changed, and an element that both sides added in different ways, are conflicts of
 * the whole element. The viewport, the measured sizes, the rev and the save time come from `mine`. `$schema` comes
 * from `theirs` if only `theirs` changed it, else from `mine`.
 *
 * @param choices - The choice for each conflict, by {@link MergeConflict.key}. A conflict without a choice, or with a
 *   choice that does not apply, takes `mine`.
 */
export function mergeDiagrams(
  base: Diagram,
  mine: Diagram,
  theirs: Diagram,
  choices: Choices = new Map(),
): MergeResult {
  const conflicts: MergeConflict[] = []
  const nodes = mergeCollection('node', [base.nodes, mine.nodes, theirs.nodes], choices, conflicts, mergeElement)
  const edges = mergeCollection('edge', [base.edges, mine.edges, theirs.edges], choices, conflicts, mergeElement)
  const flows = mergeCollection('flow', [base.flows, mine.flows, theirs.flows], choices, conflicts, mergeFlow)

  const nameScope: Scope = { kind: 'name', id: '', keyOf: () => 'name', choices, conflicts }
  const name = mergeFields(nameScope, { name: base.name }, { name: mine.name }, { name: theirs.name })
  const themeScope: Scope = { kind: 'theme', id: '', keyOf: (field) => `theme:${field}`, choices, conflicts }
  const theme = mergeFields(themeScope, base.theme, mine.theme, theirs.theme)

  const sides = [mine, theirs, base].map((diagram) => new Map(diagram.nodes.map((node) => [node.id, node])))
  const { nodes: attached, detached } = detachOrphans(nodes.items, sides)
  const ordered = parentsFirst(attached)
  const nodeIds = new Set(ordered.map((node) => node.id))
  const hasEnds = (edge: StoredEdge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)
  const { $schema: _schema, ...content } = mine
  const schema = mine.$schema === base.$schema ? theirs.$schema : mine.$schema

  return {
    diagram: {
      ...(schema === undefined ? {} : { $schema: schema }),
      ...content,
      name: name.value.name as string,
      theme: theme.value as unknown as DiagramTheme,
      nodes: ordered,
      edges: edges.items.filter(hasEnds),
      flows: flows.items,
    },
    conflicts,
    origins: new Map([...nodes.origins, ...edges.origins, ...flows.origins]),
    droppedEdges: edges.items.filter((edge) => !hasEnds(edge)),
    detachedNodes: detached,
  }
}
