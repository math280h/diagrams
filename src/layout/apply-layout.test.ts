import { describe, expect, it } from 'vitest'
import type { DiagramEdge, DiagramNode } from '@/model/types'
import { fromDiagram } from '@/persistence/serialize'
import { DiagramBuilder } from '@/templates/builder'
import { applyLayout } from './apply-layout'

function graph() {
  const b = new DiagramBuilder()
  const vpc = b.group(0, 0, 400, 300, { label: 'VPC' })
  const api = b.card(32, 56, { title: 'API' }, 216, vpc)
  const db = b.card(500, 0, { title: 'DB' })
  const edge = b.edge(api, db, { label: 'SQL' })
  return { ...fromDiagram(b.build('Shop')), vpc, api, db, edge }
}

function moved(nodes: DiagramNode[], dx: number): DiagramNode[] {
  return nodes.map((node) => ({ ...node, position: { x: node.position.x + dx, y: node.position.y } }))
}

function routed(edges: DiagramEdge[]): DiagramEdge[] {
  return edges.map((edge) => ({
    ...edge,
    data: edge.data && {
      ...edge.data,
      route: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    },
  }))
}

describe('applyLayout', () => {
  it('takes positions, group sizes and routes from the layout', () => {
    const { nodes, edges, vpc, edge } = graph()
    const laidOut = {
      nodes: moved(nodes, 100).map((node) => (node.id === vpc ? { ...node, width: 600, height: 360 } : node)),
      edges: routed(edges),
    }
    const result = applyLayout(nodes, edges, laidOut)
    expect(result.nodes.map((node) => node.position.x)).toEqual(laidOut.nodes.map((node) => node.position.x))
    expect(result.nodes.find((node) => node.id === vpc)).toMatchObject({ width: 600, height: 360 })
    expect(result.edges.find((candidate) => candidate.id === edge)?.data?.route).toHaveLength(2)
  })

  it('keeps edits, new nodes and reparented nodes from the time the layout ran', () => {
    const { nodes, edges, api, db, edge } = graph()
    const laidOut = { nodes: moved(nodes, 100), edges: routed(edges) }
    const extra = new DiagramBuilder()
    extra.card(900, 900, { title: 'New' })
    const added = fromDiagram(extra.build('x')).nodes
    const current = [
      ...nodes.map((node) =>
        node.id === db
          ? { ...node, parentId: 'elsewhere' }
          : node.id === api && node.type === 'card'
            ? { ...node, data: { ...node.data, title: 'Gateway' } }
            : node,
      ),
      ...added,
    ]
    const currentEdges = edges.map((candidate) =>
      candidate.id === edge && candidate.data
        ? { ...candidate, data: { ...candidate.data, label: 'gRPC' } }
        : candidate,
    )
    const result = applyLayout(current, currentEdges, laidOut)
    const byId = new Map(result.nodes.map((node) => [node.id, node]))
    expect(byId.get(api)?.data).toMatchObject({ title: 'Gateway' })
    expect(byId.get(api)?.position.x).toBe(laidOut.nodes.find((node) => node.id === api)!.position.x)
    expect(byId.get(db)?.position).toEqual(current.find((node) => node.id === db)!.position)
    expect(byId.get(added[0]!.id)?.position).toEqual({ x: 896, y: 896 })
    expect(result.edges[0]?.data).toMatchObject({ label: 'gRPC' })
    expect(result.edges[0]?.data?.route).toHaveLength(2)
  })

  it('keeps the old edge when its ends changed', () => {
    const { nodes, edges, db } = graph()
    const laidOut = { nodes, edges: routed(edges) }
    const current = edges.map((edge) => ({ ...edge, target: db, targetHandle: 'left' }))
    expect(applyLayout(nodes, current, laidOut).edges).toEqual(current)
  })
})
