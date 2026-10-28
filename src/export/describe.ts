import { compileFlow, type TimelineSegment } from '@/engine/flow/compile'
import { lanesText, type LaneName } from '@/model/flow'
import { readingOrder } from '@/model/graph'
import { boundaryTitle, nodeLabel, nodeTitle } from '@/model/labels'
import type { CardData, CardForm, Flow, LogLevel, ShapeKind } from '@/model/schema'
import type { DiagramEdge, DiagramNode } from '@/model/types'

export interface DescriptionSection {
  title: string
  items: string[]
  /** If true, the items are steps in order. */
  numbered: boolean
  /** A sentence after the items, for example where the flow continues after a path. Empty if there is none. */
  end: string
}

/** A text description of a diagram, for screen readers and as alt text of an image. */
export interface DiagramDescription {
  name: string
  /** One sentence that counts the parts, the boundaries, the connections and the flows. */
  summary: string
  sections: DescriptionSection[]
}

type DescribedContent = {
  name: string
  nodes: readonly DiagramNode[]
  edges: readonly DiagramEdge[]
  flows: readonly Flow[]
}

const FORM_NAMES: Record<CardForm, string> = {
  service: 'service',
  datastore: 'data store',
  queue: 'queue',
  client: 'client',
  external: 'external system',
  function: 'function',
}

const SHAPE_NAMES: Record<ShapeKind, string> = {
  rectangle: 'rectangle',
  rounded: 'rounded rectangle',
  pill: 'pill',
  circle: 'circle',
  diamond: 'diamond',
  hexagon: 'hexagon',
  cylinder: 'cylinder',
  parallelogram: 'parallelogram',
}

const STATUS_NAMES: Record<Exclude<CardData['status'], 'none'>, string> = {
  ok: 'status OK',
  warn: 'status warning',
  error: 'status error',
}

const LEVEL_NAMES: Record<Exclude<LogLevel, 'info'>, string> = { warn: 'warning', error: 'error' }

function oneLine(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
}

function counted(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

function joined(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

function partText(node: Extract<DiagramNode, { type: 'card' | 'shape' }>): string {
  if (node.type === 'shape') return `${oneLine(nodeLabel(node)) || nodeTitle(node)}: ${SHAPE_NAMES[node.data.shape]}`
  const facts = [
    FORM_NAMES[node.data.form],
    ...node.data.lines.map((line) => oneLine(line.text.replace(/\{([^{}]*)\}/g, '$1'))).filter(Boolean),
    node.data.status === 'none' ? '' : STATUS_NAMES[node.data.status],
    node.data.badge.trim() ? `badge ${node.data.badge.trim()}` : '',
  ].filter(Boolean)
  return `${nodeTitle(node)}: ${facts.join(', ')}`
}

function connectionText(edge: DiagramEdge, nameOf: (id: string) => string): string {
  const start = edge.data?.markerStart === 'arrow'
  const end = (edge.data?.markerEnd ?? 'arrow') === 'arrow'
  const [from, to] = start && !end ? [edge.target, edge.source] : [edge.source, edge.target]
  const link = start && end ? '↔' : start || end ? '→' : '—'
  const label = oneLine(edge.data?.label ?? '')
  return `${nameOf(from)} ${link} ${nameOf(to)}${label ? `: ${label}` : ''}`
}

function stepText(
  segment: TimelineSegment,
  nameOf: (id: string) => string,
  edgeById: ReadonlyMap<string, DiagramEdge>,
): string {
  const names = segment.lanes.map((lane): LaneName =>
    lane.target.kind === 'node'
      ? { kind: 'node', from: nameOf(lane.target.id), to: '' }
      : { kind: 'edge', from: nameOf(lane.fromNode!), to: nameOf(lane.toNode!) },
  )
  const { step } = segment
  const mainEdge = step.target.kind === 'edge' ? edgeById.get(step.target.id) : undefined
  const event = oneLine(step.event || (mainEdge?.data?.label ?? ''))
  const facts = [
    step.latencyMs === null ? '' : `${step.latencyMs} ms`,
    step.level === 'info' ? '' : LEVEL_NAMES[step.level],
  ].filter(Boolean)
  const caption = oneLine(step.caption)
  return [
    lanesText(names),
    event ? `: ${event}` : '',
    facts.length > 0 ? ` (${facts.join(', ')})` : '',
    caption ? ` — ${caption}` : '',
  ].join('')
}

function flowSections(
  flow: Flow,
  content: DescribedContent,
  nameOf: (id: string) => string,
  edgeById: ReadonlyMap<string, DiagramEdge>,
): DescriptionSection[] {
  const nodeIds = new Set(content.nodes.map((node) => node.id))
  const main = compileFlow(flow, nodeIds, content.edges, null).segments
  const mainNumber = (stepId: string | null) => main.findIndex((segment) => segment.step.id === stepId) + 1
  const sections: DescriptionSection[] = [
    {
      title: `Flow “${flow.name}”`,
      items: main.map((segment) => stepText(segment, nameOf, edgeById)),
      numbered: true,
      end: main.length === 0 ? 'The flow has no steps.' : '',
    },
  ]
  for (const path of flow.paths ?? []) {
    const own = compileFlow(flow, nodeIds, content.edges, path.id).segments.filter(
      (segment) => segment.pathId === path.id,
    )
    const from = mainNumber(path.fromStep)
    const rejoin = mainNumber(path.rejoinStep)
    sections.push({
      title: `Path “${path.name}” of “${flow.name}”${from > 0 ? `, after step ${from}` : ''}`,
      items: own.map((segment) => stepText(segment, nameOf, edgeById)),
      numbered: true,
      end:
        path.rejoinStep === null
          ? 'Then the flow ends.'
          : rejoin > 0
            ? `Then the flow continues at step ${rejoin}.`
            : 'Then the flow continues.',
    })
  }
  return sections
}

/**
 * Describes a diagram in text: the text on the canvas, the boundaries with the parts in them, the parts, the
 * connections, and each flow and path as numbered steps.
 *
 * The parts and the connections follow the reading order of the diagram. A text node that repeats the diagram name
 * is not in the notes.
 */
export function describeDiagram(content: DescribedContent): DiagramDescription {
  const byId = new Map(content.nodes.map((node) => [node.id, node]))
  const nameOf = (id: string) => {
    const node = byId.get(id)
    if (!node) return 'Missing node'
    return node.type === 'group' ? boundaryTitle(node) : nodeTitle(node)
  }
  const edges = content.edges.filter((edge) => byId.has(edge.source) && byId.has(edge.target))
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]))
  const ordered = readingOrder(content.nodes, edges, byId).nodes
  const rank = new Map(ordered.map((node, index) => [node.id, index]))

  const notes = ordered
    .filter((node) => node.type === 'text')
    .map((node) => oneLine(node.data.text))
    .filter((text) => text && text.toLowerCase() !== content.name.trim().toLowerCase())
  const groups = ordered.filter((node) => node.type === 'group')
  const parts = ordered.filter((node) => node.type === 'card' || node.type === 'shape')
  const boundaries = groups.map((group) => {
    const inside = ordered.filter((node) => node.parentId === group.id && node.type !== 'text').map((node) => node.id)
    const detail = oneLine(group.data.detail)
    const name = `${boundaryTitle(group)}${detail ? ` (${detail})` : ''}`
    return inside.length > 0 ? `${name}: ${inside.map(nameOf).join(', ')}` : name
  })
  const connections = edges
    .toSorted((a, b) => rank.get(a.source)! - rank.get(b.source)! || rank.get(a.target)! - rank.get(b.target)!)
    .map((edge) => connectionText(edge, nameOf))

  const counts = [
    parts.length > 0 ? counted(parts.length, 'part') : '',
    groups.length > 0 ? counted(groups.length, 'boundary', 'boundaries') : '',
    edges.length > 0 ? counted(edges.length, 'connection') : '',
    content.flows.length > 0 ? counted(content.flows.length, 'flow') : '',
  ].filter(Boolean)
  const list = (title: string, items: string[]): DescriptionSection[] =>
    items.length > 0 ? [{ title, items, numbered: false, end: '' }] : []

  return {
    name: oneLine(content.name) || 'Untitled diagram',
    summary: counts.length > 0 ? `The diagram has ${joined(counts)}.` : 'The diagram is empty.',
    sections: [
      ...list('Notes', notes),
      ...list('Boundaries', boundaries),
      ...list('Parts', parts.map(partText)),
      ...list('Connections', connections),
      ...content.flows.flatMap((flow) => flowSections(flow, content, nameOf, edgeById)),
    ],
  }
}

/** Writes a description as plain text with one line for each item. */
export function descriptionText(description: DiagramDescription): string {
  const blocks = [
    `${description.name}\n${description.summary}`,
    ...description.sections.map((section) =>
      [
        `${section.title}:`,
        ...section.items.map((item, index) => (section.numbered ? `${index + 1}. ${item}` : `- ${item}`)),
        ...(section.end ? [section.end] : []),
      ].join('\n'),
    ),
  ]
  return `${blocks.join('\n\n')}\n`
}

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }

function escapeXml(text: string): string {
  return text.replace(/[&<>]/g, (character) => XML_ESCAPES[character]!)
}

/** Adds a description to an SVG image: the name as its `title` element and the text as its `desc` element. */
export async function svgWithDescription(svg: Blob, description: DiagramDescription): Promise<Blob> {
  const text = await svg.text()
  const root = /<svg\b[^>]*>/.exec(text)
  if (!root) return svg
  const at = root.index + root[0].length
  const elements = `<title>${escapeXml(description.name)}</title><desc>${escapeXml(descriptionText(description))}</desc>`
  return new Blob([text.slice(0, at), elements, text.slice(at)], { type: svg.type || 'image/svg+xml' })
}

function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`
}

/** Writes a description as one paragraph without line breaks, for example for the `alt` attribute of an image. */
export function descriptionParagraph(description: DiagramDescription): string {
  return [
    sentence(description.name),
    description.summary,
    ...description.sections.map((section) => {
      const items = section.numbered
        ? section.items.map((item, index) => `${index + 1}. ${sentence(item)}`).join(' ')
        : section.items.length > 0
          ? sentence(section.items.join('; '))
          : ''
      return [`${section.title}:`, items, section.end].filter(Boolean).join(' ')
    }),
  ].join(' ')
}
