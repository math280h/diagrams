import { describe, expect, it } from 'vitest'
import { fromDiagram } from '@/persistence/serialize'
import { DiagramBuilder } from '@/templates/builder'
import { createResolver } from './resolve'

function graph() {
  const b = new DiagramBuilder()
  const api = b.card(0, 0, { title: 'API' })
  const db = b.card(300, 0, { title: 'Orders DB' })
  const edge = b.edge(api, db, { label: 'SQL' })
  const { nodes, edges } = fromDiagram(b.build('Shop'))
  return { nodes, edges, api, db, edge }
}

describe('createResolver', () => {
  it('finds an edge from ids with spaces around the arrow', () => {
    const { nodes, edges, api, db, edge } = graph()
    const resolver = createResolver(nodes, edges)
    expect(resolver.edge(`${api} -> ${db}`).id).toBe(edge)
    expect(resolver.edge(`${api}->${db}`).id).toBe(edge)
    expect(resolver.target(`${api} -> ${db}`)).toEqual({ kind: 'edge', id: edge })
  })

  it('finds an edge from refs and from labels', () => {
    const { nodes, edges, api, db, edge } = graph()
    const resolver = createResolver(nodes, edges, new Map([['gateway', api]]))
    expect(resolver.edge(`gateway -> ${db}`).id).toBe(edge)
    expect(resolver.edge('api -> orders db').id).toBe(edge)
  })

  it('accepts a node id or an edge id with spaces around it', () => {
    const { nodes, edges, api, edge } = graph()
    const resolver = createResolver(nodes, edges)
    expect(resolver.node(` ${api} `).id).toBe(api)
    expect(resolver.edge(` ${edge} `).id).toBe(edge)
    expect(resolver.target(` ${edge} `)).toEqual({ kind: 'edge', id: edge })
  })
})
