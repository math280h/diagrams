import { boundaryTitle, nodeLabel, nodeTitle } from '@/model/labels'
import { CARD_FORM_LABELS } from '@/model/presets'
import type { DiagramEdge, DiagramNode } from '@/model/types'

/** Returns the name that a screen reader reads for a node: its title and its kind. */
export function nodeAriaLabel(node: DiagramNode): string {
  switch (node.type) {
    case 'card':
      return `${nodeTitle(node)}, ${CARD_FORM_LABELS[node.data.form].toLowerCase()}`
    case 'group':
      return `${boundaryTitle(node)}, boundary`
    case 'shape':
      return `${nodeTitle(node)}, shape`
    case 'text':
      return nodeLabel(node).replace(/\s+/g, ' ').trim() || nodeTitle(node)
  }
}

/** Returns the name of a node in a sentence: the title, or the kind and the label of a boundary. */
export function nodeName(node: DiagramNode): string {
  return node.type === 'group' ? boundaryTitle(node) : nodeTitle(node)
}

/** Returns the name that a screen reader reads for an edge: its ends in the direction of the edge, and its label. */
export function edgeAriaLabel(edge: DiagramEdge, nameOf: (id: string) => string): string {
  const label = edge.data?.label.trim()
  return `${nameOf(edge.source)} to ${nameOf(edge.target)}${label ? `, ${label}` : ''}`
}
