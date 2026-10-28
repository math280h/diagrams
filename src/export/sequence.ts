import { compileFlow } from '@/engine/flow/compile'
import { nodeTitle } from '@/model/labels'
import { stepBody } from '@/model/payload'
import type { Flow, LogLevel, Step } from '@/model/schema'
import type { DiagramEdge, DiagramNode } from '@/model/types'

export interface SequenceParticipant {
  nodeId: string
  title: string
}

interface SequenceRowBase {
  step: Step
  /** The index of the step in the timeline of the flow. */
  segmentIndex: number
  /** The event of the step, or the edge label for an edge step without an event. */
  text: string
  latencyMs: number | null
  level: LogLevel
  caption: string
}

/** A call or a response between two participants. */
export interface SequenceMessage extends SequenceRowBase {
  kind: 'message'
  from: number
  to: number
  /** True if the token moves back along the edge, as for a response. */
  reply: boolean
  /** The body that the log line shows for this step, as compact JSON, or an empty string. */
  body: string
}

/** A step on one node. */
export interface SequenceNote extends SequenceRowBase {
  kind: 'note'
  over: number
}

export type SequenceRow = SequenceMessage | SequenceNote

export interface FlowSequence {
  /** The nodes that the flow reaches, in the order that it first reaches them. */
  participants: SequenceParticipant[]
  rows: SequenceRow[]
}

/**
 * Returns a flow as a sequence of messages between the nodes that it reaches.
 *
 * The rows follow the timeline of the flow, so a step without its node or edge is not in them.
 */
export function flowSequence(
  flow: Flow,
  content: { nodes: readonly DiagramNode[]; edges: readonly DiagramEdge[] },
): FlowSequence {
  const nodeById = new Map(content.nodes.map((node) => [node.id, node]))
  const edgeById = new Map(content.edges.map((edge) => [edge.id, edge]))
  const timeline = compileFlow(flow, new Set(nodeById.keys()), content.edges)
  const participants: SequenceParticipant[] = []
  const columnOf = new Map<string, number>()
  const column = (nodeId: string) => {
    let index = columnOf.get(nodeId)
    if (index === undefined) {
      index = participants.length
      columnOf.set(nodeId, index)
      const node = nodeById.get(nodeId)
      participants.push({ nodeId, title: node ? nodeTitle(node) : 'Missing node' })
    }
    return index
  }

  const rows = timeline.segments.map((segment): SequenceRow => {
    const { step } = segment
    const base = {
      step,
      segmentIndex: segment.index,
      latencyMs: step.latencyMs,
      level: step.level,
      caption: step.caption,
    }
    if (step.target.kind === 'node') return { ...base, kind: 'note', over: column(step.target.id), text: step.event }
    const edge = edgeById.get(step.target.id)
    return {
      ...base,
      kind: 'message',
      from: column(segment.fromNode!),
      to: column(segment.toNode!),
      reply: segment.reversed,
      text: step.event || (edge?.data?.label ?? ''),
      body: flow.bodies ? stepBody(edge?.data, segment.reversed) : '',
    }
  })
  return { participants, rows }
}

// Mermaid reads `;` as the end of a statement, `#` as the start of an entity, and `<` and `>` as HTML.
const ENTITIES: Record<string, string> = { '#': '#35;', ';': '#59;', '<': '#lt;', '>': '#gt;' }

function mermaidText(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim().replace(/[#;<>]/g, (char) => ENTITIES[char]!))
    .filter(Boolean)
    .join('<br/>')
}

function withLatency(text: string, latencyMs: number | null): string {
  if (latencyMs === null) return text
  return text ? `${text} (${latencyMs} ms)` : `${latencyMs} ms`
}

function participantIds(participants: readonly SequenceParticipant[]): string[] {
  const used = new Set<string>()
  return participants.map(({ title }) => {
    const slug = title
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32)
      .replace(/_+$/, '')
    const base = /^[a-z]/.test(slug) && slug !== 'end' ? slug : `p_${slug || 'node'}`
    let id = base
    for (let count = 2; used.has(id); count++) id = `${base}_${count}`
    used.add(id)
    return id
  })
}

const INDENT = '    '

/**
 * Writes a flow as a Mermaid sequence diagram.
 *
 * A call is a solid arrow and a response a dashed arrow; a step with the `error` level ends in a cross. A step on a node
 * is a note over it. The latency follows the event, and a caption is a note over the step.
 */
export function flowToMermaidSequence(
  flow: Flow,
  content: { nodes: readonly DiagramNode[]; edges: readonly DiagramEdge[] },
): string {
  const { participants, rows } = flowSequence(flow, content)
  const ids = participantIds(participants)
  const lines = ['sequenceDiagram', `${INDENT}title ${mermaidText(flow.name)}`]
  participants.forEach((participant, index) => {
    lines.push(`${INDENT}participant ${ids[index]} as ${mermaidText(participant.title)}`)
  })
  for (const row of rows) {
    if (row.kind === 'note') {
      const text = [withLatency(row.text, row.latencyMs), row.caption].map(mermaidText).filter(Boolean).join('<br/>')
      if (text) lines.push(`${INDENT}Note over ${ids[row.over]}: ${text}`)
      continue
    }
    const arrow = `${row.reply ? '--' : '-'}${row.level === 'error' ? 'x' : '>>'}`
    lines.push(`${INDENT}${ids[row.from]}${arrow}${ids[row.to]}: ${mermaidText(withLatency(row.text, row.latencyMs))}`)
    const caption = mermaidText(row.caption)
    if (caption) {
      const span = row.from === row.to ? ids[row.from] : `${ids[row.from]},${ids[row.to]}`
      lines.push(`${INDENT}Note over ${span}: ${caption}`)
    }
  }
  return `${lines.join('\n')}\n`
}
