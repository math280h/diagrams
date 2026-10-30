import { z } from 'zod'
import {
  DIAGRAM_VERSION,
  diagramSchema,
  storedEdgeSchema,
  storedNodeSchema,
  type Diagram,
  type StoredEdge,
  type StoredNode,
} from '@/model/schema'

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>

const FORM_BY_ICON: Record<string, string> = {
  database: 'datastore',
  'memory-stick': 'datastore',
  'hard-drive': 'datastore',
  layers: 'queue',
  waves: 'queue',
  monitor: 'client',
  user: 'client',
  smartphone: 'client',
  'app-window': 'client',
  'panel-top': 'client',
  plug: 'external',
  'credit-card': 'external',
  mail: 'external',
  cloud: 'external',
  zap: 'function',
}

function toVersion2(raw: Record<string, unknown>): Record<string, unknown> {
  const nodes = Array.isArray(raw.nodes) ? raw.nodes : []
  return {
    ...raw,
    nodes: nodes.map((node: Record<string, unknown>) => {
      if (node.type !== 'card' || typeof node.data !== 'object' || node.data === null) return node
      const data = node.data as Record<string, unknown>
      const { variant: _variant, ...rest } = data
      const icon = typeof data.icon === 'string' ? data.icon : ''
      return { ...node, data: { ...rest, form: data.form ?? FORM_BY_ICON[icon] ?? 'service' } }
    }),
  }
}

function toVersion3(raw: Record<string, unknown>): Record<string, unknown> {
  const theme = typeof raw.theme === 'object' && raw.theme !== null ? (raw.theme as Record<string, unknown>) : {}
  return { ...raw, theme: { ...theme, fonts: theme.fonts === 'geist' ? 'atkinson' : theme.fonts } }
}

function toVersion4(raw: Record<string, unknown>): Record<string, unknown> {
  const flows = Array.isArray(raw.flows) ? raw.flows : []
  return {
    ...raw,
    flows: flows.map((flow: Record<string, unknown>) => ({
      ...flow,
      steps: (Array.isArray(flow.steps) ? flow.steps : []).map((step: Record<string, unknown>) => ({
        event: '',
        latencyMs: null,
        level: 'info',
        ...step,
      })),
    })),
  }
}

function toVersion5(raw: Record<string, unknown>): Record<string, unknown> {
  const nodes = Array.isArray(raw.nodes) ? raw.nodes : []
  const theme = typeof raw.theme === 'object' && raw.theme !== null ? (raw.theme as Record<string, unknown>) : {}
  return {
    ...raw,
    theme: { boundaryColors: true, ...theme },
    nodes: nodes.map((node: Record<string, unknown>) =>
      node.type === 'group' && typeof node.data === 'object' && node.data !== null
        ? { ...node, data: { kind: 'custom', detail: '', color: 'auto', ...(node.data as Record<string, unknown>) } }
        : node,
    ),
  }
}

function toVersion6(raw: Record<string, unknown>): Record<string, unknown> {
  const theme = typeof raw.theme === 'object' && raw.theme !== null ? (raw.theme as Record<string, unknown>) : {}
  const edges = Array.isArray(raw.edges) ? raw.edges : []
  return {
    ...raw,
    theme: { protocolColors: true, ...theme, fonts: theme.fonts === 'atkinson' ? 'host' : theme.fonts },
    edges: edges.map((edge: Record<string, unknown>) =>
      typeof edge.data === 'object' && edge.data !== null
        ? { ...edge, data: { protocol: 'auto', ...(edge.data as Record<string, unknown>) } }
        : edge,
    ),
  }
}

function toVersion7(raw: Record<string, unknown>): Record<string, unknown> {
  const flows = Array.isArray(raw.flows) ? raw.flows : []
  return { ...raw, flows: flows.map((flow: Record<string, unknown>) => ({ bodies: true, ...flow })) }
}

function withoutAccent(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value
  const { accent: _accent, ...rest } = value as Record<string, unknown>
  return rest
}

function toVersion8(raw: Record<string, unknown>): Record<string, unknown> {
  const nodes = Array.isArray(raw.nodes) ? raw.nodes : []
  const edges = Array.isArray(raw.edges) ? raw.edges : []
  const flows = Array.isArray(raw.flows) ? raw.flows : []
  return {
    ...raw,
    nodes: nodes.map((node: Record<string, unknown>) => {
      if (typeof node.data !== 'object' || node.data === null) return node
      const data = withoutAccent(node.data) as Record<string, unknown>
      if (node.type === 'card' || node.type === 'shape') return { ...node, data: { color: 'neutral', ...data } }
      if (node.type === 'text')
        return { ...node, data: { ...data, tone: data.tone === 'accent' ? 'muted' : data.tone } }
      return { ...node, data }
    }),
    edges: edges.map((edge: Record<string, unknown>) => ({ ...edge, data: withoutAccent(edge.data) })),
    flows: flows.map((flow: Record<string, unknown>) => ({ ...flow, token: withoutAccent(flow.token) })),
  }
}

const NODES_WITH_DETAILS = new Set(['card', 'shape', 'group'])

function toVersion9(raw: Record<string, unknown>): Record<string, unknown> {
  const nodes = Array.isArray(raw.nodes) ? raw.nodes : []
  return {
    ...raw,
    nodes: nodes.map((node: Record<string, unknown>) =>
      NODES_WITH_DETAILS.has(String(node.type)) && typeof node.data === 'object' && node.data !== null
        ? { ...node, data: { details: { description: '', owner: '', links: [] }, ...node.data } }
        : node,
    ),
  }
}

/** Version 10 adds the optional `pinned` flag to node data, so earlier data needs no change. */
function toVersion10(raw: Record<string, unknown>): Record<string, unknown> {
  return raw
}

/** Version 11 adds the optional `opens` field to cards and groups, so earlier data needs no change. */
function toVersion11(raw: Record<string, unknown>): Record<string, unknown> {
  return raw
}

/** Version 12 adds the optional `parallel` targets of steps and `paths` of flows, so earlier data needs no change. */
function toVersion12(raw: Record<string, unknown>): Record<string, unknown> {
  return raw
}

/** Version 13 adds the optional `sensitive` mark of body fields, so earlier data needs no change. */
function toVersion13(raw: Record<string, unknown>): Record<string, unknown> {
  return raw
}

/** Version 14 adds `cameraStyle` and `cameraMotion` to each flow. Earlier flows frame their steps with the gentle ease. */
function toVersion14(raw: Record<string, unknown>): Record<string, unknown> {
  const flows = Array.isArray(raw.flows) ? raw.flows : []
  return {
    ...raw,
    flows: flows.map((flow: Record<string, unknown>) => ({ cameraStyle: 'frame', cameraMotion: 'gentle', ...flow })),
  }
}

/** Version 15 adds `stepNumbers` to each flow and overview steps (`target.kind` `flow`). Earlier flows show no numbers. */
function toVersion15(raw: Record<string, unknown>): Record<string, unknown> {
  const flows = Array.isArray(raw.flows) ? raw.flows : []
  return { ...raw, flows: flows.map((flow: Record<string, unknown>) => ({ stepNumbers: false, ...flow })) }
}

/** Version 16 adds `routeAround` to the theme, and `bends` to edges. Earlier diagrams keep the routes of the layout. */
function toVersion16(raw: Record<string, unknown>): Record<string, unknown> {
  const theme = typeof raw.theme === 'object' && raw.theme !== null ? (raw.theme as Record<string, unknown>) : {}
  return { ...raw, theme: { routeAround: false, ...theme } }
}

/** The migration at index `n` converts a diagram from version `n + 1` to version `n + 2`. */
const MIGRATIONS: Migration[] = [
  toVersion2,
  toVersion3,
  toVersion4,
  toVersion5,
  toVersion6,
  toVersion7,
  toVersion8,
  toVersion9,
  toVersion10,
  toVersion11,
  toVersion12,
  toVersion13,
  toVersion14,
  toVersion15,
  toVersion16,
]

export class DiagramFormatError extends Error {}

function upgrade(raw: Record<string, unknown>, subject: string): Record<string, unknown> {
  let current = raw
  let version = typeof current.version === 'number' ? current.version : 1
  if (version > DIAGRAM_VERSION) {
    throw new DiagramFormatError(
      `${subject} format ${version} from a newer version of Diagrams. This version reads format ${DIAGRAM_VERSION} and older. Update Diagrams to open it.`,
    )
  }
  while (version < DIAGRAM_VERSION) {
    const step = MIGRATIONS[version - 1]
    if (!step) throw new DiagramFormatError(`This app cannot read diagrams of version ${version}.`)
    current = step(current)
    version++
    current.version = version
  }
  return current
}

function problem(error: z.ZodError): string {
  const issue = error.issues[0]
  const field = issue && issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
  return `${field}${issue?.message ?? 'unknown problem'}`
}

/**
 * Converts stored or imported data to the current diagram version and validates it.
 *
 * @throws DiagramFormatError If the data is not a diagram, or if its version is newer than this app.
 */
export function migrate(raw: unknown): Diagram {
  if (typeof raw !== 'object' || raw === null) throw new DiagramFormatError('The data is not a diagram.')
  const result = diagramSchema.safeParse(upgrade(raw as Record<string, unknown>, 'This diagram uses'))
  if (!result.success) {
    throw new DiagramFormatError(`The data is not a diagram that this app can read (${problem(result.error)}).`)
  }
  return result.data
}

const elementsSchema = z.object({ nodes: z.array(storedNodeSchema), edges: z.array(storedEdgeSchema) })

/**
 * Converts copied nodes and edges to the current diagram version and validates them.
 *
 * @param version - The diagram version of the app that copied them.
 * @throws DiagramFormatError If the data has no valid nodes and edges, or if its version is newer than this app.
 */
export function migrateElements(
  nodes: unknown,
  edges: unknown,
  version: number,
): { nodes: StoredNode[]; edges: StoredEdge[] } {
  const result = elementsSchema.safeParse(upgrade({ version, nodes, edges, flows: [] }, 'The copied nodes use'))
  if (!result.success) throw new DiagramFormatError(`The copied nodes cannot be read (${problem(result.error)}).`)
  return result.data
}
