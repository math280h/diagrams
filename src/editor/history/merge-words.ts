import { COLOR_NAMES, COLORS, type Color } from '@/model/colors'
import type { MergeConflict, MergeSide } from '@/model/diagram-merge'
import { absoluteRect } from '@/model/graph'
import { nodeTitle } from '@/model/labels'
import { unionRects, type Rect } from '@/model/rect'
import type { Diagram, StoredNode } from '@/model/schema'
import type { DiagramNode } from '@/model/types'
import type { OutsideReview } from '@/store/outside-review'

/** A value of one side of a conflict, in the form that the review shows. */
export type ValueView =
  | { kind: 'text'; text: string }
  | { kind: 'empty'; text: string }
  | { kind: 'color'; color: Color; text: string }

const MOVE_THRESHOLD = 0.5

function findNode(diagrams: readonly Diagram[], id: string): StoredNode | undefined {
  return diagrams.map((diagram) => diagram.nodes.find((node) => node.id === id)).find((node) => node !== undefined)
}

function findEdge(diagrams: readonly Diagram[], id: string) {
  return diagrams.map((diagram) => diagram.edges.find((edge) => edge.id === id)).find((edge) => edge !== undefined)
}

function sides(review: OutsideReview) {
  return [review.result.diagram, review.mine, review.theirs, review.base]
}

function nodeWord(review: OutsideReview, id: string) {
  const node = findNode(sides(review), id)
  return node ? nodeTitle(node) : 'A node'
}

/** Returns the name of the element that a conflict is about, for example `API`, `Web → API` or `Checkout flow`. */
export function conflictElement(review: OutsideReview, conflict: MergeConflict): string {
  switch (conflict.kind) {
    case 'node':
      return nodeWord(review, conflict.id)
    case 'edge': {
      const edge = findEdge(sides(review), conflict.id)
      return edge ? `${nodeWord(review, edge.source)} → ${nodeWord(review, edge.target)}` : 'A connection'
    }
    case 'flow': {
      const flow = sides(review)
        .flatMap((diagram) => diagram.flows)
        .find((item) => item.id === conflict.id)
      return `${flow?.name || 'Untitled'} flow`
    }
    case 'name':
      return 'Diagram'
    case 'theme':
      return 'Style'
  }
}

function capitalized(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function itemText(item: unknown): string {
  if (typeof item !== 'object' || item === null) return String(item)
  const fields = item as Record<string, unknown>
  const text = [fields.text, fields.label, fields.caption, fields.name, fields.path, fields.url].find(
    (value): value is string => typeof value === 'string' && value !== '',
  )
  return text ?? 'an item'
}

function count(amount: number, one: string, many: string) {
  return amount === 1 ? `1 ${one}` : `${amount} ${many}`
}

function listText(base: unknown, list: readonly unknown[]): string {
  const before = Array.isArray(base) ? (base as unknown[]) : []
  const idOf = (item: unknown) => (typeof item === 'object' && item !== null && 'id' in item ? item.id : item)
  const beforeIds = new Set(before.map(idOf))
  const nowIds = new Set(list.map(idOf))
  const added = list.filter((item) => !beforeIds.has(idOf(item)))
  const removed = before.filter((item) => !nowIds.has(idOf(item))).length
  const parts = [count(list.length, 'item', 'items')]
  if (added.length > 0) parts.push(`adds ${added.map((item) => `“${itemText(item)}”`).join(', ')}`)
  if (removed > 0) parts.push(`removes ${removed}`)
  return parts.join(', ')
}

function moveText(base: unknown, value: { x: number; y: number }): string {
  if (typeof base !== 'object' || base === null) return `At ${Math.round(value.x)}, ${Math.round(value.y)}`
  const from = base as { x: number; y: number }
  const dx = value.x - from.x
  const dy = value.y - from.y
  const directions = [
    ...(Math.abs(dx) > MOVE_THRESHOLD ? [dx > 0 ? 'right' : 'left'] : []),
    ...(Math.abs(dy) > MOVE_THRESHOLD ? [dy > 0 ? 'down' : 'up'] : []),
  ]
  return directions.length === 0 ? 'Not moved' : `Moved ${directions.join(' and ')}`
}

function isColor(value: unknown): value is Color {
  return COLORS.some((color) => color === value)
}

/** Returns the value that one side of a conflict has, in the form that the review shows. */
export function valueView(conflict: MergeConflict, side: MergeSide): ValueView {
  const value = side === 'mine' ? conflict.mine : conflict.theirs
  if (conflict.field === '') {
    if (conflict.deletedBy) return { kind: 'text', text: conflict.deletedBy === side ? 'Deleted' : 'Changed' }
    return { kind: 'text', text: 'Added' }
  }
  if (value === undefined || value === null) return { kind: 'empty', text: 'None' }
  if (conflict.field.endsWith('color') && isColor(value)) {
    return { kind: 'color', color: value, text: COLOR_NAMES[value] }
  }
  if (conflict.field === 'position' && typeof value === 'object') {
    return { kind: 'text', text: moveText(conflict.base, value as { x: number; y: number }) }
  }
  if (Array.isArray(value)) return { kind: 'text', text: capitalized(listText(conflict.base, value)) }
  if (typeof value === 'string') {
    if (value === '') return { kind: 'empty', text: 'Empty' }
    return { kind: 'text', text: conflict.choices.includes('custom') ? value : capitalized(value) }
  }
  if (typeof value === 'boolean') return { kind: 'text', text: value ? 'On' : 'Off' }
  if (typeof value === 'number') return { kind: 'text', text: String(Math.round(value * 100) / 100) }
  return { kind: 'text', text: 'Changed' }
}

function fieldValue(element: unknown, field: string): unknown {
  let current = element
  for (const part of field.split('.')) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

/** Returns the text that the result of the review has for a text conflict, to start the typed value with. */
export function resultText(review: OutsideReview, conflict: MergeConflict): string {
  const { diagram } = review.result
  const value =
    conflict.kind === 'name'
      ? diagram.name
      : conflict.kind === 'node'
        ? fieldValue(
            diagram.nodes.find((node) => node.id === conflict.id),
            conflict.field,
          )
        : conflict.kind === 'edge'
          ? fieldValue(
              diagram.edges.find((edge) => edge.id === conflict.id),
              conflict.field,
            )
          : conflict.kind === 'flow'
            ? fieldValue(
                diagram.flows.find((flow) => flow.id === conflict.id),
                conflict.field,
              )
            : undefined
  return typeof value === 'string' ? value : ''
}

function nodeRect(diagram: Diagram, id: string): Rect | null {
  const byId = new Map(diagram.nodes.map((node) => [node.id, node as DiagramNode]))
  const node = byId.get(id)
  return node ? absoluteRect(node, byId) : null
}

/**
 * Returns the canvas area of the node or the edge of a conflict in one diagram, or `null` if the diagram does not
 * have it or the conflict is about the name, the theme or a flow.
 */
export function conflictRect(diagram: Diagram, conflict: MergeConflict): Rect | null {
  if (conflict.kind === 'node') return nodeRect(diagram, conflict.id)
  if (conflict.kind !== 'edge') return null
  const edge = diagram.edges.find((item) => item.id === conflict.id)
  if (!edge) return null
  return unionRects([nodeRect(diagram, edge.source), nodeRect(diagram, edge.target)].filter((rect) => rect !== null))
}

/** Returns the key of the element of a conflict, for example `node:n_1`, or `null` for the name and the theme. */
export function conflictElementKey(conflict: MergeConflict): string | null {
  return conflict.kind === 'node' || conflict.kind === 'edge' || conflict.kind === 'flow'
    ? `${conflict.kind}:${conflict.id}`
    : null
}
