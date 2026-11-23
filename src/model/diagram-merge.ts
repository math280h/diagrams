import type { Diagram, DiagramTheme, Flow, StoredEdge, StoredNode } from './schema'

export type MergeSide = 'mine' | 'theirs'

/** Where a node, an edge or a flow of a merge result changed since the base. */
export type MergeOrigin = MergeSide | 'both' | 'conflict'

export type MergeConflictKind = 'node' | 'edge' | 'flow' | 'name' | 'theme'

/**
 * A part of the diagram that the two sides changed in different ways.
 *
 * `fields` names the fields that both sides changed, for example `position` or `data.label`. It is empty when one
 * side deleted the element (`deletedBy`) or when both sides added an element with the same id.
 */
export interface MergeConflict {
  /** The key of the choice: `node:<id>`, `edge:<id>`, `flow:<id>`, `name` or `theme`. */
  key: string
  kind: MergeConflictKind
  /** The id of the node, edge or flow, or an empty string for the name and the theme. */
  id: string
  fields: string[]
  deletedBy?: MergeSide
}

export interface MergeResult {
  /** The merged diagram. A conflict without a choice takes the side `mine`. */
  diagram: Diagram
  conflicts: MergeConflict[]
  /** The origin of each changed node, edge and flow of the result, by its conflict key. */
  origins: ReadonlyMap<string, MergeOrigin>
  /** The edges that the result does not have, because their source or target node is not in the result. */
  droppedEdges: StoredEdge[]
  /** The ids of the nodes that the result moves to the top level, because their parent is not in the result. */
  detachedNodes: string[]
}

type Fields = Record<string, unknown>
type Element = StoredNode | StoredEdge

interface Merged<T> {
  item: T
  conflicts: string[]
  origin: MergeOrigin | undefined
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

function mergeFields(base: Fields, mine: Fields, theirs: Fields, choice: MergeSide | undefined, prefix = '') {
  const value: Fields = {}
  const conflicts: string[] = []
  let fromMine = false
  let fromTheirs = false
  for (const key of new Set([...Object.keys(mine), ...Object.keys(theirs), ...Object.keys(base)])) {
    const mineChanged = !deepEqual(base[key], mine[key])
    const theirsChanged = !deepEqual(base[key], theirs[key])
    let field = mine[key]
    if (theirsChanged && !mineChanged) {
      field = theirs[key]
      fromTheirs = true
    } else if (mineChanged && theirsChanged && !deepEqual(mine[key], theirs[key])) {
      conflicts.push(`${prefix}${key}`)
      if (choice === 'theirs') field = theirs[key]
    } else if (mineChanged) {
      fromMine = true
      fromTheirs ||= theirsChanged
    }
    if (field !== undefined) value[key] = field
  }
  return { value, conflicts, fromMine, fromTheirs }
}

function originOf(conflicts: readonly string[], fromMine: boolean, fromTheirs: boolean): MergeOrigin | undefined {
  if (conflicts.length > 0) return 'conflict'
  if (fromMine && fromTheirs) return 'both'
  if (fromMine) return 'mine'
  return fromTheirs ? 'theirs' : undefined
}

function fieldsAndData(element: Element, withData: boolean): { fields: Fields; data: Fields } {
  const { data, measured: _measured, ...fields } = element as StoredNode
  return withData ? { fields: { ...fields, data }, data: {} } : { fields, data }
}

function mergeElement<T extends Element>(base: T, mine: T, theirs: T, choice: MergeSide | undefined): Merged<T> {
  if (sameContent(base, theirs) || sameContent(mine, theirs)) {
    const fromTheirs = !sameContent(base, theirs)
    return { item: mine, conflicts: [], origin: originOf([], !sameContent(base, mine), fromTheirs) }
  }
  const sameType = base.type === mine.type && base.type === theirs.type
  const [b, m, t] = [base, mine, theirs].map((element) => fieldsAndData(element, !sameType)) as [
    ReturnType<typeof fieldsAndData>,
    ReturnType<typeof fieldsAndData>,
    ReturnType<typeof fieldsAndData>,
  ]
  const fields = mergeFields(b.fields, m.fields, t.fields, choice)
  const data = sameType ? mergeFields(b.data, m.data, t.data, choice, 'data.') : null
  const { measured } = mine as StoredNode
  const item = {
    ...fields.value,
    ...(data ? { data: data.value } : {}),
    ...(measured ? { measured } : {}),
  } as unknown as T
  const conflicts = [...fields.conflicts, ...(data?.conflicts ?? [])]
  return {
    item,
    conflicts,
    origin: originOf(conflicts, fields.fromMine || !!data?.fromMine, fields.fromTheirs || !!data?.fromTheirs),
  }
}

function mergeFlow(base: Flow, mine: Flow, theirs: Flow, choice: MergeSide | undefined): Merged<Flow> {
  const mineChanged = !deepEqual(base, mine)
  const theirsChanged = !deepEqual(base, theirs)
  if (!theirsChanged || deepEqual(mine, theirs)) {
    return { item: mine, conflicts: [], origin: originOf([], mineChanged, theirsChanged) }
  }
  if (!mineChanged) return { item: theirs, conflicts: [], origin: 'theirs' }
  return { item: choice === 'theirs' ? theirs : mine, conflicts: ['steps'], origin: 'conflict' }
}

function mergeCollection<T extends { id: string }>(
  kind: 'node' | 'edge' | 'flow',
  [base, mine, theirs]: readonly [readonly T[], readonly T[], readonly T[]],
  choices: ReadonlyMap<string, MergeSide>,
  mergeCommon: (base: T, mine: T, theirs: T, choice: MergeSide | undefined) => Merged<T>,
) {
  const baseById = new Map(base.map((item) => [item.id, item]))
  const mineById = new Map(mine.map((item) => [item.id, item]))
  const theirsById = new Map(theirs.map((item) => [item.id, item]))
  const result = new Map<string, T>()
  const conflicts: MergeConflict[] = []
  const origins = new Map<string, MergeOrigin>()

  for (const id of new Set([...mineById.keys(), ...theirsById.keys(), ...baseById.keys()])) {
    const key = `${kind}:${id}`
    const choice = choices.get(key)
    const b = baseById.get(id)
    const m = mineById.get(id)
    const t = theirsById.get(id)
    const conflict = (deletedBy?: MergeSide) => {
      conflicts.push({ key, kind, id, fields: [], ...(deletedBy ? { deletedBy } : {}) })
      origins.set(key, 'conflict')
    }
    if (!b) {
      if (m && t && !sameContent(m, t)) conflict()
      else origins.set(key, m && t ? 'both' : m ? 'mine' : 'theirs')
      const chosen = m && t && choice === 'theirs' ? t : (m ?? t)
      if (chosen) result.set(id, chosen)
    } else if (!m || !t) {
      const kept = m ?? t
      if (!kept || sameContent(b, kept)) continue
      conflict(m ? 'theirs' : 'mine')
      if ((choice ?? 'mine') === (m ? 'mine' : 'theirs')) result.set(id, kept)
    } else {
      const merged = mergeCommon(b, m, t, choice)
      if (merged.conflicts.length > 0) conflicts.push({ key, kind, id, fields: merged.conflicts })
      if (merged.origin) origins.set(key, merged.origin)
      result.set(id, merged.item)
    }
  }

  const order = [...mineById.keys(), ...[...theirsById.keys()].filter((id) => !mineById.has(id))]
  return { items: order.flatMap((id) => result.get(id) ?? []), conflicts, origins }
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
 * Merges two versions of a diagram that both started from `base`, for example the open diagram and the version that
 * changed on disk.
 *
 * Nodes and edges merge field by field, and their data merges data field by data field. A flow merges as one unit.
 * A change on one side takes that side, and the same change on both sides counts once. A field that the two sides
 * changed in different ways, and an element that one side deleted and the other side changed, are conflicts. The
 * viewport, the measured sizes, the rev and the save time come from `mine`.
 *
 * @param choices - The side for each conflict, by {@link MergeConflict.key}. A conflict without a choice takes `mine`.
 */
export function mergeDiagrams(
  base: Diagram,
  mine: Diagram,
  theirs: Diagram,
  choices: ReadonlyMap<string, MergeSide> = new Map(),
): MergeResult {
  const nodes = mergeCollection('node', [base.nodes, mine.nodes, theirs.nodes], choices, mergeElement)
  const edges = mergeCollection('edge', [base.edges, mine.edges, theirs.edges], choices, mergeElement)
  const flows = mergeCollection('flow', [base.flows, mine.flows, theirs.flows], choices, mergeFlow)
  const conflicts = [...nodes.conflicts, ...edges.conflicts, ...flows.conflicts]

  const name = mergeFields({ name: base.name }, { name: mine.name }, { name: theirs.name }, choices.get('name'))
  if (name.conflicts.length > 0) conflicts.push({ key: 'name', kind: 'name', id: '', fields: ['name'] })
  const theme = mergeFields(base.theme, mine.theme, theirs.theme, choices.get('theme'))
  if (theme.conflicts.length > 0) conflicts.push({ key: 'theme', kind: 'theme', id: '', fields: theme.conflicts })

  const sides = [mine, theirs, base].map((diagram) => new Map(diagram.nodes.map((node) => [node.id, node])))
  const { nodes: attached, detached } = detachOrphans(nodes.items, sides)
  const ordered = parentsFirst(attached)
  const nodeIds = new Set(ordered.map((node) => node.id))
  const hasEnds = (edge: StoredEdge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)

  return {
    diagram: {
      ...mine,
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
