import { DIAGRAM_VERSION, type Diagram, type StoredEdge, type StoredNode } from '@/model/schema'
import { sortParentsFirst } from '@/model/graph'
import type { DiagramEdge, DiagramNode } from '@/model/types'
import type { DocState } from '@/store/doc-store'

function round(value: number) {
  return Math.round(value * 100) / 100
}

export function toStoredNode(node: DiagramNode): StoredNode {
  const stored = {
    id: node.id,
    type: node.type,
    position: { x: round(node.position.x), y: round(node.position.y) },
    data: node.data,
  } as StoredNode
  if (node.width !== undefined) stored.width = round(node.width)
  if (node.height !== undefined) stored.height = round(node.height)
  if (node.measured?.width !== undefined && node.measured.height !== undefined) {
    stored.measured = { width: round(node.measured.width), height: round(node.measured.height) }
  }
  if (node.parentId) stored.parentId = node.parentId
  if (node.zIndex !== undefined) stored.zIndex = node.zIndex
  return stored
}

export function toStoredEdge(edge: DiagramEdge): StoredEdge | null {
  if (!edge.data) return null
  const stored: StoredEdge = { id: edge.id, type: 'flow', source: edge.source, target: edge.target, data: edge.data }
  if (edge.sourceHandle) stored.sourceHandle = edge.sourceHandle
  if (edge.targetHandle) stored.targetHandle = edge.targetHandle
  if (edge.zIndex !== undefined) stored.zIndex = edge.zIndex
  return stored
}

export function toDiagram(
  state: Pick<DocState, 'id' | 'name' | 'theme' | 'nodes' | 'edges' | 'flows' | 'viewport' | 'createdAt' | 'rev'>,
): Diagram {
  return {
    id: state.id ?? '',
    name: state.name,
    version: DIAGRAM_VERSION,
    theme: state.theme,
    nodes: state.nodes.map(toStoredNode),
    edges: state.edges.map(toStoredEdge).filter((edge): edge is StoredEdge => edge !== null),
    flows: state.flows,
    viewport: state.viewport,
    rev: state.rev,
    createdAt: state.createdAt,
    updatedAt: Date.now(),
  }
}

export function fromDiagram(diagram: Diagram): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  const nodes = sortParentsFirst(diagram.nodes.map((node) => ({ ...node })))
  const edges: DiagramEdge[] = diagram.edges.map((edge) => ({ ...edge }))
  return { nodes, edges }
}
