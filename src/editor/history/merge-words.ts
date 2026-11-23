import type { MergeConflict } from '@/model/diagram-merge'
import { absoluteRect } from '@/model/graph'
import { nodeTitle } from '@/model/labels'
import { unionRects, type Rect } from '@/model/rect'
import type { Diagram, StoredNode } from '@/model/schema'
import type { DiagramNode } from '@/model/types'
import type { OutsideReview } from '@/store/outside-review'

const FIELD_WORDS: Record<string, string> = {
  width: 'size',
  height: 'size',
  parentId: 'boundary',
  zIndex: 'order',
  data: 'kind',
  type: 'kind',
  source: 'ends',
  target: 'ends',
  sourceHandle: 'sides',
  targetHandle: 'sides',
  'data.color': 'colour',
  'data.route': 'route',
  'data.bends': 'route',
}

function fieldWord(field: string) {
  return FIELD_WORDS[field] ?? field.replace(/^data\./, '').replaceAll(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)
}

function joinWords(words: readonly string[]) {
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`
}

function capitalized(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function findNode(review: OutsideReview, id: string): StoredNode | undefined {
  return [review.result.diagram, review.mine, review.theirs]
    .map((diagram) => diagram.nodes.find((node) => node.id === id))
    .find((node) => node !== undefined)
}

function findEdge(review: OutsideReview, id: string) {
  return [review.result.diagram, review.mine, review.theirs]
    .map((diagram) => diagram.edges.find((edge) => edge.id === id))
    .find((edge) => edge !== undefined)
}

function nodeWord(review: OutsideReview, id: string) {
  const node = findNode(review, id)
  return node ? nodeTitle(node) : 'A node'
}

/** Returns the name of the part of the diagram that a conflict is about, for example `API` or `Web → API`. */
export function conflictTitle(review: OutsideReview, conflict: MergeConflict): string {
  switch (conflict.kind) {
    case 'node':
      return nodeWord(review, conflict.id)
    case 'edge': {
      const edge = findEdge(review, conflict.id)
      return edge ? `${nodeWord(review, edge.source)} → ${nodeWord(review, edge.target)}` : 'A connection'
    }
    case 'flow': {
      const flow = [...review.mine.flows, ...review.theirs.flows].find((item) => item.id === conflict.id)
      return `The “${flow?.name || 'Untitled'}” flow`
    }
    case 'name':
      return 'Diagram name'
    case 'theme':
      return 'Style'
  }
}

/**
 * Describes what the two sides did in a conflict, in one sentence.
 *
 * @param fromOutside - Where the version from outside comes from, for example `from disk`.
 */
export function conflictDetail(review: OutsideReview, conflict: MergeConflict, fromOutside: string): string {
  if (conflict.deletedBy === 'mine') return `Deleted here, and changed ${fromOutside}.`
  if (conflict.deletedBy === 'theirs') return `Changed here, and deleted ${fromOutside}.`
  if (conflict.kind === 'name') {
    return `Here: “${review.mine.name}”. ${capitalized(fromOutside)}: “${review.theirs.name}”.`
  }
  if (conflict.kind === 'flow') return 'Both sides changed this flow.'
  if (conflict.fields.length === 0) return 'Both sides added it, in different ways.'
  return `Both sides changed the ${joinWords([...new Set(conflict.fields.map(fieldWord))])}.`
}

function nodeRect(diagram: Diagram, id: string): Rect | null {
  const byId = new Map(diagram.nodes.map((node) => [node.id, node as DiagramNode]))
  const node = byId.get(id)
  return node ? absoluteRect(node, byId) : null
}

/** Returns the canvas area of the node or edge of a conflict, or `null` for the name, the theme and a flow. */
export function conflictRect(review: OutsideReview, conflict: MergeConflict): Rect | null {
  const diagrams = [review.result.diagram, review.mine, review.theirs]
  const rectOf = (id: string) => diagrams.map((diagram) => nodeRect(diagram, id)).find((rect) => rect !== null) ?? null
  if (conflict.kind === 'node') return rectOf(conflict.id)
  if (conflict.kind !== 'edge') return null
  const edge = findEdge(review, conflict.id)
  if (!edge) return null
  return unionRects([rectOf(edge.source), rectOf(edge.target)].filter((rect): rect is Rect => rect !== null))
}
