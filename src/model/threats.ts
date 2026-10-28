import { boundaryKind, type BoundaryTier } from './boundaries'
import { boundaryTitle } from './labels'
import type { PayloadPart } from './payload'
import type { CardForm, EdgeData, SensitiveKind } from './schema'
import type { DiagramEdge, DiagramNode } from './types'

/** The boundary tiers that separate trust: an owner of resources, a network, a subnet and a rule set. */
export const TRUST_TIERS: ReadonlySet<BoundaryTier> = new Set(['scope', 'network', 'subnet', 'security'])

/** The name of the line between the parts of the system and the outside parts, when no boundary marks it. */
export const SYSTEM_EDGE = 'the edge of the system'

const OUTSIDE_FORMS: ReadonlySet<CardForm> = new Set(['client', 'external'])

export const SENSITIVE_NAMES: Record<SensitiveKind, string> = { personal: 'Personal data', secret: 'Secret' }

export interface SensitiveField {
  part: PayloadPart
  path: string
  kind: SensitiveKind
}

/** An edge that carries sensitive fields, and the trust boundaries between its ends. */
export interface DataCrossing {
  edgeId: string
  fields: SensitiveField[]
  /** `secret` if a field is a secret, else `personal`. */
  kind: SensitiveKind
  /**
   * The names of the trust boundaries around one end and not the other, outer first. Without such a boundary, an edge
   * between a client or external card and another card crosses {@link SYSTEM_EDGE}. Empty if the edge crosses none.
   */
  boundaries: string[]
}

/** Returns the marked fields of the request body, then of the response body. */
export function sensitiveFields(data: EdgeData | undefined): SensitiveField[] {
  return (['request', 'response'] as const).flatMap((part) =>
    (data?.[part]?.fields ?? []).flatMap((field) =>
      field.sensitive ? [{ part, path: field.path.trim(), kind: field.sensitive }] : [],
    ),
  )
}

function trustGroups(nodeId: string, byId: ReadonlyMap<string, DiagramNode>): DiagramNode[] {
  const groups: DiagramNode[] = []
  let parent = byId.get(byId.get(nodeId)?.parentId ?? '')
  while (parent && groups.length < 32) {
    if (parent.type === 'group' && TRUST_TIERS.has(boundaryKind(parent.data.kind).tier)) groups.unshift(parent)
    parent = byId.get(parent.parentId ?? '')
  }
  return groups
}

/**
 * Describes the sensitive fields of an edge and the boundaries that it crosses, for example
 * `customer (personal data)` and `Crosses AWS VPC payments.`
 */
export function crossingText(crossing: DataCrossing): { fields: string; boundaries: string } {
  const fields = crossing.fields
    .map(
      (field) =>
        `${field.part === 'response' ? 'response ' : ''}${field.path} (${SENSITIVE_NAMES[field.kind].toLowerCase()})`,
    )
    .join(', ')
  const boundaries =
    crossing.boundaries.length > 0 ? `Crosses ${crossing.boundaries.join(' and ')}.` : 'Crosses no trust boundary.'
  return { fields, boundaries }
}

/** Returns each edge that carries a sensitive field, with the trust boundaries that it crosses. */
export function dataCrossings(nodes: readonly DiagramNode[], edges: readonly DiagramEdge[]): DataCrossing[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const outside = (id: string) => {
    const node = byId.get(id)
    return node?.type === 'card' && OUTSIDE_FORMS.has(node.data.form)
  }
  return edges.flatMap((edge) => {
    const fields = sensitiveFields(edge.data)
    if (fields.length === 0) return []
    const source = trustGroups(edge.source, byId)
    const target = trustGroups(edge.target, byId)
    const crossed = [
      ...source.filter((group) => !target.includes(group)),
      ...target.filter((group) => !source.includes(group)),
    ].flatMap((group) => (group.type === 'group' ? [boundaryTitle(group)] : []))
    const boundaries = crossed.length > 0 ? crossed : outside(edge.source) !== outside(edge.target) ? [SYSTEM_EDGE] : []
    const kind = fields.some((field) => field.kind === 'secret') ? 'secret' : 'personal'
    return [{ edgeId: edge.id, fields, kind, boundaries }]
  })
}
