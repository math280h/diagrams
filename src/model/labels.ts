import { boundaryKind, boundaryKindLabel } from './boundaries'
import type { StoredNode } from './schema'
import type { DiagramNode } from './types'

const UNTITLED: Record<StoredNode['type'], string> = {
  card: 'Untitled node',
  shape: 'Untitled shape',
  text: 'Empty text',
  group: 'Untitled boundary',
}

/**
 * Returns the text that names a node on the canvas. This is the card title, the shape label, the whole text of a text
 * node, or the group label. A group without a label gets the name of its boundary kind.
 */
export function nodeLabel(node: StoredNode | DiagramNode): string {
  switch (node.type) {
    case 'card':
      return node.data.title
    case 'shape':
      return node.data.label
    case 'text':
      return node.data.text
    case 'group':
      return node.data.label || boundaryKindLabel(boundaryKind(node.data.kind))
  }
}

/** Returns the first line of the label of a node, for a title. It is empty for a node without a label. */
export function nodeName(node: StoredNode | DiagramNode): string {
  return nodeLabel(node).split('\n')[0]!.trim()
}

/** Returns {@link nodeName}, or a name such as "Untitled node" for a node without a label. */
export function nodeTitle(node: StoredNode | DiagramNode): string {
  return nodeName(node) || UNTITLED[node.type]
}

/** Returns the kind and the label of a boundary, for example `AWS VPC payments`, or {@link nodeTitle} without both. */
export function boundaryTitle(node: Extract<StoredNode | DiagramNode, { type: 'group' }>): string {
  const kind = boundaryKindLabel(boundaryKind(node.data.kind))
  return [kind, node.data.label].filter(Boolean).join(' ') || nodeTitle(node)
}
