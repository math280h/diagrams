import { definedFields } from '@/lib/defined-fields'
import { edgeTravel } from '@/engine/flow/compile'
import { iconSourceOf, type IconSet } from '@/canvas/icons/library'
import { createStep } from '@/editor/flow/record'
import { findEdgePath } from '@/engine/route'
import { boundaryKind, BOUNDARY_BY_ID, TINTED_TIERS } from '@/model/boundaries'
import type { Color } from '@/model/colors'
import {
  createEdge,
  DEFAULT_TRAFFIC,
  defaultCardData,
  defaultGroupData,
  defaultPayloadField,
  defaultShapeData,
  defaultTextData,
  emptyDetails,
  newId,
} from '@/model/defaults'
import { safeLinkUrl } from '@/model/details'
import { loadDiagramOrNull } from '@/persistence/active-repository'
import { DEFAULT_NODE_SIZE, ELEMENT_Z } from '@/model/graph'
import { fieldIssues, fieldsFromExample, mergeFields, PayloadJsonError, type PayloadPart } from '@/model/payload'
import { defaultShapeSize } from '@/model/presets'
import type {
  CardData,
  EdgeData,
  GroupData,
  NodeDetails,
  Payload,
  ShapeData,
  Side,
  Step,
  TextData,
} from '@/model/schema'
import type { DiagramEdge, DiagramNode } from '@/model/types'
import { nodeLabel } from '@/model/labels'
import type { HandlerContext } from '@/agent/context'
import { ToolError } from '@/agent/errors'
import type { Resolver } from '@/agent/resolve'
import type { EdgeInput, NodeInput, NodePatch, StepInput } from '@/agent/tool-definitions'

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }

const DETAIL_FIELDS = ['description', 'owner', 'links'] as const

const FIELDS_BY_KIND = {
  card: ['form', 'lines', 'badge', 'status', 'color', 'pinned', 'opens', ...DETAIL_FIELDS],
  shape: ['shape', 'color', 'pinned', ...DETAIL_FIELDS],
  text: ['textSize', 'pinned'],
  group: ['boundary', 'detail', 'color', 'pinned', 'opens', ...DETAIL_FIELDS],
} as const satisfies Record<DiagramNode['type'], readonly (keyof NodeInput)[]>

const KIND_FIELDS = new Set(Object.values(FIELDS_BY_KIND).flat())

/** Checks icon names against the icon sets and the Lucide names, and finds the card form of product icons. */
export function createIconChecker(ctx: HandlerContext) {
  let sets: Promise<IconSet[]> | null = null
  let lucide: Promise<ReadonlySet<string>> | null = null

  const entry = async (icon: string) => {
    const source = iconSourceOf(icon)
    if (!source) return undefined
    sets ??= ctx.iconSets()
    return (await sets).find((candidate) => candidate.source === source)?.byId.get(icon)
  }

  return {
    /**
     * Returns the icon name if it exists. An unknown name becomes an empty string and adds a warning.
     *
     * @returns `undefined` if the input has no icon.
     */
    async check(icon: string | undefined, warnings: string[]): Promise<string | undefined> {
      if (icon === undefined || icon === '') return icon
      if (iconSourceOf(icon)) {
        if (await entry(icon)) return icon
      } else {
        lucide ??= ctx.lucideNames().then((names) => new Set(names))
        if ((await lucide).has(icon)) return icon
      }
      warnings.push(`The icon "${icon}" does not exist, so the node has no icon. Find icons with search_icons.`)
      return ''
    },

    /** Returns the card form that suits a product icon, for example `datastore` for a database. */
    async formOf(icon: string | undefined): Promise<CardData['form'] | undefined> {
      return icon ? (await entry(icon))?.form : undefined
    },
  }
}

function warnFields(input: NodeInput | NodePatch, kind: DiagramNode['type'], label: string, warnings: string[]) {
  const allowed = new Set<string>(FIELDS_BY_KIND[kind])
  for (const field of KIND_FIELDS) {
    if (input[field] !== undefined && !allowed.has(field)) {
      warnings.push(`"${field}" does not apply to the ${kind} "${label}", so it was ignored.`)
    }
  }
}

/** Returns the details that the input sets on top of the current details, or `undefined` if it sets none. */
function detailsFrom(
  input: Pick<NodeInput, 'description' | 'owner' | 'links'>,
  current: NodeDetails,
  label: string,
  warnings: string[],
): NodeDetails | undefined {
  if (input.description === undefined && input.owner === undefined && input.links === undefined) return undefined
  const links = input.links?.flatMap((link) => {
    if (safeLinkUrl(link.url) === null) {
      warnings.push(`The link "${link.url}" of "${label}" is not a web or mail address, so it was left out.`)
      return []
    }
    return [{ id: newId('k'), label: link.label ?? '', url: link.url.trim() }]
  })
  return {
    description: input.description ?? current.description,
    owner: input.owner ?? current.owner,
    links: links ?? current.links,
  }
}

/**
 * Returns the data field for the diagram that a node opens, or no field if the diagram does not exist. An empty string
 * opens nothing.
 */
function opensField(opens: string | null | undefined, label: string, warnings: string[]): { opens?: string } {
  if (opens === undefined) return {}
  if (opens === null) return { opens: '' }
  if (loadDiagramOrNull(opens)) return { opens }
  warnings.push(`No diagram has the id "${opens}", so "${label}" opens nothing. Find ids with list_diagrams.`)
  return {}
}

function pinnedField(pinned: boolean | undefined): { pinned?: boolean } {
  return pinned === undefined ? {} : { pinned }
}

function nodeColor(color: NodeInput['color']): Color | undefined {
  return color === 'auto' ? 'neutral' : color
}

function groupKind(boundary: string | undefined, warnings: string[]) {
  if (boundary !== undefined && !BOUNDARY_BY_ID.has(boundary)) {
    warnings.push(`"${boundary}" is not a boundary kind, so the group is a custom group. See list_boundary_kinds.`)
  }
  return boundaryKind(boundary ?? 'custom')
}

/** Makes a node from agent input. The position is absolute and the parent is not set. */
export function buildNode(
  input: NodeInput,
  icon: string | undefined,
  iconForm: CardData['form'] | undefined,
  warnings: string[],
): DiagramNode {
  const kind = input.kind ?? 'card'
  warnFields(input, kind, input.label, warnings)
  const id = newId('n')
  const position = { x: input.x ?? 0, y: input.y ?? 0 }
  switch (kind) {
    case 'card':
      return {
        id,
        type: 'card',
        position,
        width: input.width ?? DEFAULT_NODE_SIZE.width,
        zIndex: ELEMENT_Z,
        data: defaultCardData({
          title: input.label,
          form: input.form ?? iconForm ?? 'service',
          icon: icon ?? '',
          lines: (input.lines ?? []).map((text) => ({ id: newId('l'), text })),
          badge: input.badge ?? '',
          status: input.status ?? 'none',
          color: nodeColor(input.color) ?? 'neutral',
          details: detailsFrom(input, emptyDetails(), input.label, warnings) ?? emptyDetails(),
          ...pinnedField(input.pinned),
          ...opensField(input.opens, input.label, warnings),
        }),
      }
    case 'shape': {
      const shape = input.shape ?? 'rounded'
      const size = defaultShapeSize(shape)
      return {
        id,
        type: 'shape',
        position,
        width: input.width ?? size.width,
        height: input.height ?? size.height,
        zIndex: ELEMENT_Z,
        data: defaultShapeData({
          label: input.label,
          shape,
          icon: icon ?? '',
          color: nodeColor(input.color) ?? 'neutral',
          details: detailsFrom(input, emptyDetails(), input.label, warnings) ?? emptyDetails(),
          ...pinnedField(input.pinned),
        }),
      }
    }
    case 'text':
      return {
        id,
        type: 'text',
        position,
        ...(input.width !== undefined ? { width: input.width } : {}),
        zIndex: ELEMENT_Z,
        data: defaultTextData({ text: input.label, size: input.textSize ?? 'md', ...pinnedField(input.pinned) }),
      }
    case 'group': {
      const boundary = groupKind(input.boundary, warnings)
      return {
        id,
        type: 'group',
        position,
        ...(input.width !== undefined ? { width: input.width } : {}),
        ...(input.height !== undefined ? { height: input.height } : {}),
        zIndex: -1,
        data: defaultGroupData({
          kind: boundary.id,
          label: input.label,
          detail: input.detail ?? '',
          icon: icon ?? boundary.icon,
          tint: TINTED_TIERS.has(boundary.tier),
          color: input.color ?? 'auto',
          details: detailsFrom(input, emptyDetails(), input.label, warnings) ?? emptyDetails(),
          ...pinnedField(input.pinned),
          ...opensField(input.opens, input.label, warnings),
        }),
      }
    }
  }
}

/** Turns a node patch from an agent into a data patch for the node kind. */
export function nodeDataPatch(
  node: DiagramNode,
  patch: NodePatch,
  icon: string | undefined,
  warnings: string[],
): Partial<CardData> | Partial<ShapeData> | Partial<TextData> | Partial<GroupData> {
  warnFields(patch, node.type, nodeLabel(node), warnings)
  switch (node.type) {
    case 'card':
      return definedFields({
        icon,
        title: patch.label,
        form: patch.form,
        lines: patch.lines?.map((text) => ({ id: newId('l'), text })),
        badge: patch.badge,
        status: patch.status,
        color: nodeColor(patch.color),
        details: detailsFrom(patch, node.data.details, nodeLabel(node), warnings),
        ...pinnedField(patch.pinned),
        ...opensField(patch.opens, nodeLabel(node), warnings),
      })
    case 'shape':
      return definedFields({
        icon,
        label: patch.label,
        shape: patch.shape,
        color: nodeColor(patch.color),
        details: detailsFrom(patch, node.data.details, nodeLabel(node), warnings),
        ...pinnedField(patch.pinned),
      })
    case 'text':
      return definedFields({ text: patch.label, size: patch.textSize, ...pinnedField(patch.pinned) })
    case 'group': {
      const boundary = patch.boundary !== undefined ? groupKind(patch.boundary, warnings) : null
      return definedFields({
        label: patch.label,
        detail: patch.detail,
        kind: boundary?.id,
        tint: boundary ? TINTED_TIERS.has(boundary.tier) : undefined,
        icon: icon ?? boundary?.icon,
        color: patch.color,
        details: detailsFrom(patch, node.data.details, nodeLabel(node), warnings),
        ...pinnedField(patch.pinned),
        ...opensField(patch.opens, nodeLabel(node), warnings),
      })
    }
  }
}

/**
 * Returns the edge data patch for the edge fields of agent input. Fields that the input does not set stay out of the
 * patch.
 *
 * @param current - The edge data now. A traffic toggle keeps the other traffic settings of it.
 */
type PayloadInput = NonNullable<EdgeInput['request']>

/**
 * Makes the body of an edge from agent input. An example replaces the fields, given fields change the fields with
 * the same path or add new fields, and removed paths go.
 *
 * @returns The body, or `undefined` if it has no fields.
 * @throws ToolError If the input gives nothing to change, the example is not an object or an array, or the body
 *     cannot hold a field.
 */
export function payloadFromInput(part: PayloadPart, input: PayloadInput, current?: Payload): Payload | undefined {
  if (input.example === undefined && !input.fields && !input.remove) {
    throw new ToolError(`Give an example, fields or paths to remove for the ${part} body, or null to remove it.`)
  }
  let fields = current?.fields ?? []
  if (input.example !== undefined) {
    try {
      fields = mergeFields(fields, fieldsFromExample(input.example))
    } catch (error) {
      if (error instanceof PayloadJsonError) throw new ToolError(`The ${part} example cannot be read. ${error.message}`)
      throw error
    }
  }
  const removed = new Set((input.remove ?? []).map((path) => path.trim()))
  fields = fields.filter((field) => !removed.has(field.path.trim()))
  for (const given of input.fields ?? []) {
    const patch = definedFields({
      path: given.path.trim(),
      type: given.type,
      required: given.required,
      example: given.example === undefined ? undefined : String(given.example),
      description: given.description,
    })
    const index = fields.findIndex((field) => field.path.trim() === patch.path)
    fields =
      index >= 0
        ? fields.map((field, at) => (at === index ? { ...field, ...patch } : field))
        : [...fields, defaultPayloadField(patch)]
  }
  const issues = fieldIssues(fields)
  if (issues.size > 0) {
    const problems = fields
      .filter((field) => issues.has(field.id))
      .map((field) => `"${field.path}": ${issues.get(field.id)}`)
    throw new ToolError(`The ${part} body cannot hold these fields. ${problems.join(' ')}`)
  }
  return fields.length > 0 ? { fields } : undefined
}

function payloadPatch(part: PayloadPart, input: PayloadInput | null | undefined, current?: Payload) {
  if (input === undefined) return {}
  return { [part]: input === null ? undefined : payloadFromInput(part, input, current) }
}

export function edgeDataPatch(input: Partial<EdgeInput>, current?: EdgeData): Partial<EdgeData> {
  return {
    ...definedFields({
      label: input.label,
      protocol: input.protocol,
      stroke: input.style,
      path: input.path,
      traffic:
        input.traffic === undefined ? undefined : { ...(current?.traffic ?? DEFAULT_TRAFFIC), enabled: input.traffic },
      markerStart:
        input.bidirectional === undefined ? undefined : input.bidirectional ? ('arrow' as const) : ('none' as const),
    }),
    ...payloadPatch('request', input.request, current?.request),
    ...payloadPatch('response', input.response, current?.response),
  }
}

type SideInput = Side | 'auto'

/**
 * Returns the handles for the sides that an agent chose.
 *
 * @returns The handles, `'auto'` to let the app choose the sides again, or `null` if the input names no side.
 */
export function edgeSides(input: { fromSide?: SideInput; toSide?: SideInput }) {
  if (!input.fromSide && !input.toSide) return null
  if (input.fromSide === 'auto' || input.toSide === 'auto') return 'auto' as const
  const fromSide = input.fromSide ?? OPPOSITE[input.toSide!]
  const toSide = input.toSide ?? OPPOSITE[input.fromSide!]
  return { sourceHandle: fromSide, targetHandle: toSide }
}

export function buildEdge(input: EdgeInput, resolver: Resolver, warnings: string[]): DiagramEdge {
  const source = resolver.node(input.from)
  const target = resolver.node(input.to)
  if (source.id === target.id) throw new ToolError(`An edge cannot go from "${input.from}" to itself.`)
  if (source.type === 'group' || target.type === 'group') {
    warnings.push(`An edge from "${input.from}" to "${input.to}" touches a group. Connect the nodes inside it instead.`)
  }
  const sides = edgeSides(input)
  const fixed = sides && sides !== 'auto' ? sides : null
  return createEdge(
    source.id,
    target.id,
    { ...edgeDataPatch(input), ...(fixed ? { sides: 'fixed' as const } : {}) },
    fixed ?? {},
  )
}

export function applyStepInput(step: Step, input: Partial<StepInput>): Step {
  const { target: _target, ...fields } = input
  return { ...step, ...definedFields(fields) }
}

/**
 * Makes flow steps from agent input.
 *
 * @param connect - If true, a step to a node that the previous node does not touch gets edge steps along the shortest
 *     connection in front of it.
 * @param startNode - The node where the token is before the first new step.
 */
export function buildSteps(
  inputs: readonly StepInput[],
  resolver: Resolver,
  edges: readonly DiagramEdge[],
  connect: boolean,
  warnings: string[],
  startNode: string | null = null,
): Step[] {
  const steps: Step[] = []
  let tokenAt = startNode
  for (const input of inputs) {
    const target = resolver.target(input.target)
    if (target.kind === 'node') {
      if (connect && tokenAt && tokenAt !== target.id) {
        const path = findEdgePath(tokenAt, target.id, edges)
        if (path === null) {
          warnings.push(`No edges connect the previous node to "${input.target}", so the token jumps there.`)
        }
        for (const edgeId of path ?? []) steps.push(createStep({ kind: 'edge', id: edgeId }))
      }
      tokenAt = target.id
    } else {
      const edge = edges.find((candidate) => candidate.id === target.id)
      if (edge) tokenAt = edgeTravel(edge, tokenAt).toNode
    }
    steps.push(applyStepInput(createStep(target, input.caption ?? ''), input))
  }
  return steps
}
