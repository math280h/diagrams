import { DIAGRAM_VERSION, diagramSchema, type Diagram } from '@/model/schema'

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

/** The migration at index `n` converts a diagram from version `n + 1` to version `n + 2`. */
const MIGRATIONS: Migration[] = [toVersion2, toVersion3, toVersion4, toVersion5, toVersion6]

export class DiagramFormatError extends Error {}

/**
 * Converts stored or imported data to the current diagram version and validates it.
 *
 * @throws DiagramFormatError If the data is not a diagram, or if its version is newer than this app.
 */
export function migrate(raw: unknown): Diagram {
  if (typeof raw !== 'object' || raw === null) throw new DiagramFormatError('The data is not a diagram.')
  let current = raw as Record<string, unknown>
  let version = typeof current.version === 'number' ? current.version : 1
  if (version > DIAGRAM_VERSION) {
    throw new DiagramFormatError(
      `The diagram has version ${version}. This app reads version ${DIAGRAM_VERSION} or lower.`,
    )
  }
  while (version < DIAGRAM_VERSION) {
    const step = MIGRATIONS[version - 1]
    if (!step) throw new DiagramFormatError(`This app cannot read diagrams of version ${version}.`)
    current = step(current)
    version++
    current.version = version
  }
  const result = diagramSchema.safeParse(current)
  if (!result.success) {
    const issue = result.error.issues[0]
    const field = issue && issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
    throw new DiagramFormatError(
      `The data is not a diagram that this app can read (${field}${issue?.message ?? 'unknown problem'}).`,
    )
  }
  return result.data
}
