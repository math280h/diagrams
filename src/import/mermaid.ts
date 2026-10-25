import { createDiagram, defaultCardData, defaultGroupData, defaultShapeData, newId, createEdge } from '@/model/defaults'
import { loadIconSets, matchIcon, type IconSet } from '@/canvas/icons/library'
import { matchPreset } from '@/model/presets'
import { matchBoundary, TINTED_TIERS } from '@/model/boundaries'
import { ELEMENT_Z } from '@/model/graph'
import type { Diagram, GroupData, ShapeKind } from '@/model/schema'
import type { DiagramEdge, DiagramNode } from '@/model/types'
import { layoutDiagram, type LayoutDirection } from '@/layout/diagram-layout'
import { toStoredEdge, toStoredNode } from '@/persistence/serialize'
import { errorMessage } from '@/lib/error-message'

export interface MermaidNode {
  id: string
  label: string
  shape: string
  parentId?: string
  isGroup: boolean
}

export interface MermaidEdge {
  start: string
  end: string
  label: string
  stroke: string
  arrowTypeEnd: string
  arrowTypeStart: string
}

export interface MermaidGraph {
  direction: LayoutDirection
  nodes: MermaidNode[]
  edges: MermaidEdge[]
}

export class MermaidImportError extends Error {}

interface FlowchartDb {
  getData(): { nodes: unknown[]; edges: unknown[] }
  getDirection?(): string
}

function isFlowchartDb(value: unknown): value is FlowchartDb {
  return typeof value === 'object' && value !== null && typeof (value as FlowchartDb).getData === 'function'
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

const DIRECTIONS: Record<string, LayoutDirection> = { TB: 'DOWN', TD: 'DOWN', BT: 'UP', LR: 'RIGHT', RL: 'LEFT' }

/**
 * Parses Mermaid flowchart text.
 *
 * The function loads the `mermaid` package when it runs the first time. It needs a DOM.
 *
 * @throws MermaidImportError If the text is not a flowchart, or if Mermaid cannot parse it.
 */
export async function parseMermaidFlowchart(source: string): Promise<MermaidGraph> {
  const { default: mermaid } = await import('mermaid')
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
  let diagram: Awaited<ReturnType<typeof mermaid.mermaidAPI.getDiagramFromText>>
  try {
    diagram = await mermaid.mermaidAPI.getDiagramFromText(source)
  } catch (error) {
    throw new MermaidImportError(errorMessage(error))
  }
  if (!diagram.type.startsWith('flowchart')) {
    throw new MermaidImportError(`The text is a "${diagram.type}" diagram. Only flowcharts can be imported.`)
  }
  const db: unknown = diagram.db
  if (!isFlowchartDb(db))
    throw new MermaidImportError('This Mermaid diagram is not a flowchart. Paste a flowchart instead.')

  const data = db.getData()
  const nodes: MermaidNode[] = data.nodes.map((raw) => {
    const node = raw as Record<string, unknown>
    return {
      id: text(node.id),
      label: text(node.label) || text(node.id),
      shape: text(node.shape),
      parentId: text(node.parentId) || undefined,
      isGroup: node.isGroup === true,
    }
  })
  const edges: MermaidEdge[] = data.edges.map((raw) => {
    const edge = raw as Record<string, unknown>
    return {
      start: text(edge.start),
      end: text(edge.end),
      label: text(edge.label),
      stroke: text(edge.stroke) || text(edge.thickness) || text(edge.pattern),
      arrowTypeEnd: text(edge.arrowTypeEnd),
      arrowTypeStart: text(edge.arrowTypeStart),
    }
  })
  const direction = DIRECTIONS[db.getDirection?.() ?? 'TB'] ?? 'DOWN'
  return { direction, nodes, edges }
}

const ENTITIES: Record<string, string> = { quot: '"', amp: '&', lt: '<', gt: '>', nbsp: ' ', apos: "'" }

/** Converts a Mermaid label to plain text lines. */
export function cleanLabel(label: string): string[] {
  const plain = label
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/fa:fa-[\w-]+/g, '')
    .replace(/[*_`]/g, '')
    .replace(/#(\w+);/g, (match, name: string) => ENTITIES[name] ?? match)
    .replace(/&(\w+);/g, (match, name: string) => ENTITIES[name] ?? match)
  return plain
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

const SHAPE_MAP: Record<string, ShapeKind | 'card' | 'database'> = {
  stadium: 'pill',
  circle: 'circle',
  doublecircle: 'circle',
  circ: 'circle',
  diamond: 'diamond',
  question: 'diamond',
  decision: 'diamond',
  diam: 'diamond',
  hexagon: 'hexagon',
  hex: 'hexagon',
  lean_right: 'parallelogram',
  lean_left: 'parallelogram',
  trapezoid: 'parallelogram',
  inv_trapezoid: 'parallelogram',
  'lean-r': 'parallelogram',
  'lean-l': 'parallelogram',
  cylinder: 'database',
  cyl: 'database',
  das: 'database',
  'lin-cyl': 'database',
}

/** Matches the provider names that {@link boundaryData} removes from a subgraph title. */
const PROVIDER_NAMES =
  /\b(amazon web services|amazon|aws|microsoft azure|azure|google cloud platform|google cloud|gcp|kubernetes|k8s)\b/gi

function boundaryData(title: string): GroupData {
  const kind = matchBoundary(title)
  if (kind.tier === 'custom') return defaultGroupData({ label: title })
  const rest = title
    .replace(new RegExp(`\\b(${kind.keywords.join('|')})\\b`, 'i'), '')
    .replace(PROVIDER_NAMES, '')
    .replace(/\s+/g, ' ')
    .trim()
  return defaultGroupData({ kind: kind.id, label: rest, icon: kind.icon, tint: TINTED_TIERS.has(kind.tier) })
}

function toDiagramNode(node: MermaidNode, iconSets: readonly IconSet[]): DiagramNode {
  const [title = node.id, ...rest] = cleanLabel(node.label)
  const position = { x: 0, y: 0 }
  if (node.isGroup) {
    return {
      id: node.id,
      type: 'group',
      position,
      width: 320,
      height: 200,
      zIndex: -1,
      data: boundaryData(title),
    }
  }
  const mapped = SHAPE_MAP[node.shape] ?? 'card'
  if (mapped !== 'card' && mapped !== 'database') {
    const square = mapped === 'circle' || mapped === 'diamond' || mapped === 'hexagon'
    return {
      id: node.id,
      type: 'shape',
      zIndex: ELEMENT_Z,
      position,
      width: square ? 136 : 172,
      height: square ? 136 : 56,
      data: defaultShapeData({
        shape: mapped,
        label: [title, ...rest].join(' '),
      }),
    }
  }
  const preset = mapped === 'database' ? matchPreset('database') : matchPreset(`${title} ${rest.join(' ')}`)
  const template = preset?.create(position)
  const named = matchIcon(iconSets, title)
  return {
    id: node.id,
    type: 'card',
    zIndex: ELEMENT_Z,
    position,
    width: 216,
    data: defaultCardData({
      title,
      icon: named?.id ?? '',
      form: template?.type === 'card' ? template.data.form : (named?.form ?? 'service'),
      lines: rest.map((line) => ({ id: newId('l'), text: line })),
    }),
  }
}

function toDiagramEdge(edge: MermaidEdge): DiagramEdge | null {
  if (edge.stroke === 'invisible') return null
  const [label = ''] = cleanLabel(edge.label)
  const created = createEdge(edge.start, edge.end, {
    label,
    stroke: edge.stroke === 'dotted' ? 'dashed' : 'solid',
    width: edge.stroke === 'thick' ? 2.25 : 1.25,
    markerEnd: edge.arrowTypeEnd.includes('point') ? 'arrow' : 'none',
    markerStart: edge.arrowTypeStart.includes('point') ? 'arrow' : 'none',
  })
  return created
}

/**
 * Converts Mermaid flowchart text into a laid out diagram.
 *
 * @throws MermaidImportError If the text is not a flowchart, or if Mermaid cannot parse it.
 */
export async function mermaidToDiagram(source: string, name = 'Imported flowchart'): Promise<Diagram> {
  const [graph, iconSets] = await Promise.all([parseMermaidFlowchart(source), loadIconSets().catch(() => [])])
  const ids = new Map<string, string>()
  for (const node of graph.nodes) ids.set(node.id, newId('n'))
  const nodes = graph.nodes.map((node) => {
    const converted = toDiagramNode(node, iconSets)
    converted.id = ids.get(node.id)!
    if (node.parentId && ids.has(node.parentId)) converted.parentId = ids.get(node.parentId)
    return converted
  })
  const edges = graph.edges
    .map(toDiagramEdge)
    .filter((edge): edge is DiagramEdge => edge !== null && ids.has(edge.source) && ids.has(edge.target))
    .map((edge) => ({ ...edge, source: ids.get(edge.source)!, target: ids.get(edge.target)! }))
  if (nodes.length === 0) throw new MermaidImportError('The flowchart has no nodes.')

  const laidOut = await layoutDiagram(nodes, edges, graph.direction)
  return {
    ...createDiagram(name),
    nodes: laidOut.nodes.map(toStoredNode),
    edges: laidOut.edges.map(toStoredEdge).filter((edge) => edge !== null),
  }
}
