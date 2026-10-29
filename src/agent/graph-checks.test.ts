import { describe, expect, it } from 'vitest'
import { fromDiagram } from '@/persistence/serialize'
import { TEMPLATES } from '@/templates'
import { lintDiagram, queryGraph } from './graph-checks'

describe('queryGraph', () => {
  const diagram = TEMPLATES.find((template) => template.id === 'order-system')!.build()
  const content = { ...fromDiagram(diagram), flows: diagram.flows }
  const id = (label: string) => content.nodes.find((node) => node.type === 'card' && node.data.title === label)!.id

  it('lists the incomers and the outgoers of a node with their edges', () => {
    const incomers = queryGraph(content, 'incomers', id('Orders'))
    expect(incomers.results?.map((result) => result.node.label)).toEqual(['API gateway'])
    const outgoers = queryGraph(content, 'outgoers', id('Orders'))
    expect(outgoers.results?.map((result) => result.node.label).toSorted()).toEqual(
      ['Postgres', 'Redis', 'Stripe', 'order.created'].toSorted(),
    )
    expect(outgoers.results?.find((result) => result.node.label === 'Postgres')?.edge).toMatchObject({
      protocol: 'data',
    })
  })

  it('finds the chain of edges between two nodes', () => {
    const result = queryGraph(content, 'path', id('Browser'), id('Email worker'))
    expect(result.found).toBe(true)
    expect(result.hops?.map((hop) => hop.reaches.label)).toEqual([
      'API gateway',
      'Orders',
      'order.created',
      'Email worker',
    ])
  })
})

describe('lintDiagram', () => {
  it('finds no warning in the templates', () => {
    for (const template of TEMPLATES) {
      const diagram = template.build()
      const warnings = lintDiagram({ ...fromDiagram(diagram), flows: diagram.flows }).filter(
        (issue) => issue.severity === 'warning',
      )
      expect(warnings, template.id).toEqual([])
    }
  })
})
