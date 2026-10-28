import { compileFlow, type Lane, type Timeline } from '@/engine/flow/compile'
import { nodeTitle } from '@/model/labels'
import { stepBody } from '@/model/payload'
import type { Flow, FlowPath, LogLevel, Step } from '@/model/schema'
import type { DiagramEdge, DiagramNode } from '@/model/types'

export interface SequenceParticipant {
  nodeId: string
  title: string
}

interface SequenceRowBase {
  step: Step
  /** The index of the step in the timeline of the flow. */
  segmentIndex: number
  /** The index of the target in the step: 0 for the main target, then the parallel targets. */
  lane: number
  /** The number of targets of the step. */
  lanes: number
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

type Content = { nodes: readonly DiagramNode[]; edges: readonly DiagramEdge[] }

function sequenceBuilder(flow: Flow, content: Content) {
  const nodeById = new Map(content.nodes.map((node) => [node.id, node]))
  const edgeById = new Map(content.edges.map((edge) => [edge.id, edge]))
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

  const laneRow = (step: Step, segmentIndex: number, lane: Lane, laneIndex: number, lanes: number): SequenceRow => {
    const base = {
      step,
      segmentIndex,
      lane: laneIndex,
      lanes,
      latencyMs: step.latencyMs,
      level: step.level,
      caption: laneIndex === 0 ? step.caption : '',
    }
    if (lane.target.kind === 'node') return { ...base, kind: 'note', over: column(lane.target.id), text: step.event }
    const edge = edgeById.get(lane.target.id)
    return {
      ...base,
      kind: 'message',
      from: column(lane.fromNode!),
      to: column(lane.toNode!),
      reply: lane.reversed,
      text: step.event || (edge?.data?.label ?? ''),
      body: flow.bodies ? stepBody(edge?.data, lane.reversed) : '',
    }
  }

  return {
    participants,
    timeline: (pathId: string | null) => compileFlow(flow, new Set(nodeById.keys()), content.edges, pathId),
    rows: (timeline: Timeline): SequenceRow[] =>
      timeline.segments.flatMap((segment) =>
        segment.lanes.map((lane, index) => laneRow(segment.step, segment.index, lane, index, segment.lanes.length)),
      ),
  }
}

/**
 * Returns a flow as a sequence of messages between the nodes that it reaches.
 *
 * The rows follow the timeline of the flow, so a step without its node or edge is not in them. A step with parallel
 * targets gives one row for each target, the main target first.
 *
 * @param pathId - The path of the flow, or `null` for the main steps.
 */
export function flowSequence(flow: Flow, content: Content, pathId: string | null = null): FlowSequence {
  const builder = sequenceBuilder(flow, content)
  const rows = builder.rows(builder.timeline(pathId))
  return { participants: builder.participants, rows }
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

function rowLines(row: SequenceRow, ids: readonly string[], indent: string): string[] {
  if (row.kind === 'note') {
    const text = [withLatency(row.text, row.latencyMs), row.caption].map(mermaidText).filter(Boolean).join('<br/>')
    return text ? [`${indent}Note over ${ids[row.over]}: ${text}`] : []
  }
  const arrow = `${row.reply ? '--' : '-'}${row.level === 'error' ? 'x' : '>>'}`
  const lines = [
    `${indent}${ids[row.from]}${arrow}${ids[row.to]}: ${mermaidText(withLatency(row.text, row.latencyMs))}`,
  ]
  const caption = mermaidText(row.caption)
  if (caption) {
    const span = row.from === row.to ? ids[row.from] : `${ids[row.from]},${ids[row.to]}`
    lines.push(`${indent}Note over ${span}: ${caption}`)
  }
  return lines
}

function stepLines(rows: readonly SequenceRow[], ids: readonly string[], depth: number): string[] {
  const indent = INDENT.repeat(depth)
  if (rows.length < 2) return rows.flatMap((row) => rowLines(row, ids, indent))
  const inner = INDENT.repeat(depth + 1)
  return rows.flatMap((row, index) => [
    `${indent}${index === 0 ? 'par' : 'and'}`,
    ...rowLines(row, ids, inner),
    ...(index === rows.length - 1 ? [`${indent}end`] : []),
  ])
}

/**
 * Writes a flow as a Mermaid sequence diagram.
 *
 * A call is a solid arrow and a response a dashed arrow; a step with the `error` level ends in a cross. A step on a node
 * is a note over it. The latency follows the event, and a caption is a note over the step. A step with parallel targets
 * is a `par` block. Paths are `alt` blocks after the step where they start: the first section holds the main steps,
 * and each path a section with its steps and the main steps from where it rejoins.
 */
export function flowToMermaidSequence(flow: Flow, content: Content): string {
  const builder = sequenceBuilder(flow, content)
  const rowsByStep = new Map<string, SequenceRow[]>()
  const collect = (rows: readonly SequenceRow[], only?: ReadonlySet<string>) => {
    for (const row of rows) {
      if (only && !only.has(row.step.id)) continue
      if (!rowsByStep.has(row.step.id) || row.lane === 0) rowsByStep.set(row.step.id, [])
      rowsByStep.get(row.step.id)!.push(row)
    }
  }
  collect(builder.rows(builder.timeline(null)))
  const mainIndex = new Map(flow.steps.map((step, index) => [step.id, index]))
  const paths = (flow.paths ?? []).filter((path) => path.steps.length > 0 && mainIndex.has(path.fromStep))
  for (const path of paths) {
    collect(builder.rows(builder.timeline(path.id)), new Set(path.steps.map((step) => step.id)))
  }
  const rejoinIndex = (path: FlowPath) => {
    const index = path.rejoinStep === null ? undefined : mainIndex.get(path.rejoinStep)
    return index !== undefined && index > mainIndex.get(path.fromStep)! ? index : null
  }

  const ids = participantIds(builder.participants)
  const body: string[] = []
  const emitSteps = (steps: readonly Step[], depth: number) => {
    for (const step of steps) body.push(...stepLines(rowsByStep.get(step.id) ?? [], ids, depth))
  }
  const emitMain = (start: number, end: number, depth: number) => {
    let index = start
    while (index < end) {
      const step = flow.steps[index]!
      emitSteps([step], depth)
      const group = paths.filter((path) => path.fromStep === step.id)
      if (group.length === 0) {
        index++
        continue
      }
      const rejoins = group.map(rejoinIndex)
      const rangeEnd = rejoins.includes(null) ? end : Math.min(end, Math.max(...(rejoins as number[])))
      const indent = INDENT.repeat(depth)
      body.push(`${indent}alt Main path`)
      emitMain(index + 1, rangeEnd, depth + 1)
      group.forEach((path, position) => {
        body.push(`${indent}else ${mermaidText(path.name) || 'Path'}`)
        emitSteps(path.steps, depth + 1)
        const rejoin = rejoins[position]
        if (rejoin !== null && rejoin !== undefined) emitMain(rejoin, rangeEnd, depth + 1)
      })
      body.push(`${indent}end`)
      index = rangeEnd
    }
  }
  emitMain(0, flow.steps.length, 1)

  const lines = ['sequenceDiagram', `${INDENT}title ${mermaidText(flow.name)}`]
  builder.participants.forEach((participant, index) => {
    lines.push(`${INDENT}participant ${ids[index]} as ${mermaidText(participant.title)}`)
  })
  return `${[...lines, ...body].join('\n')}\n`
}
