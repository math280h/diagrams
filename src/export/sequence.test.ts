import { describe, expect, it } from 'vitest'
import { fromDiagram } from '@/persistence/serialize'
import { TEMPLATES } from '@/templates'
import { DiagramBuilder, edgeStep, nodeStep } from '@/templates/builder'
import { flowSequence, flowToMermaidSequence } from './sequence'

function shop() {
  const b = new DiagramBuilder()
  const browser = b.card(0, 0, { title: 'Browser' })
  const api = b.card(300, 0, { title: 'Orders API' })
  const db = b.card(600, 0, { title: 'end' })
  const toApi = b.edge(browser, api, { label: 'HTTPS' })
  const toDb = b.edge(api, db, { label: 'SQL' })
  b.flow('Place #1; pay', [
    nodeStep(browser, 'The shopper presses Pay.', 1300, 'fit', 1, { event: 'POST /orders' }),
    edgeStep(toApi, '', 1200, 'follow', 1, { latencyMs: 38 }),
    edgeStep(toDb, 'Write the <order> row.', 1200, 'follow', 1, { event: 'INSERT orders', latencyMs: 4 }),
    edgeStep(toDb, '', 1200, 'follow', 1, { event: 'deadlock', level: 'error' }),
    edgeStep(toApi, '', 1200, 'follow', 1, { event: '500', level: 'warn' }),
  ])
  const diagram = b.build('Shop')
  return { diagram, content: fromDiagram(diagram), flow: diagram.flows[0]! }
}

describe('flowSequence', () => {
  it('lists the nodes in the order the flow reaches them and marks the way back as a reply', () => {
    const { content, flow } = shop()
    const sequence = flowSequence(flow, content)
    expect(sequence.participants.map((participant) => participant.title)).toEqual(['Browser', 'Orders API', 'end'])
    expect(
      sequence.rows.map((row) =>
        row.kind === 'note' ? ['note', row.over, row.text] : ['message', row.from, row.to, row.reply, row.text],
      ),
    ).toEqual([
      ['note', 0, 'POST /orders'],
      ['message', 0, 1, false, 'HTTPS'],
      ['message', 1, 2, false, 'INSERT orders'],
      ['message', 2, 1, true, 'deadlock'],
      ['message', 1, 0, true, '500'],
    ])
  })

  it('shows the body of an edge when the flow shows bodies', () => {
    const diagram = TEMPLATES.find((template) => template.id === 'order-system')!.build()
    const flow = diagram.flows[0]!
    const first = flowSequence(flow, fromDiagram(diagram)).rows.find((row) => row.kind === 'message')!
    expect(first.kind === 'message' && first.body).toContain('LAMP-01')
    const hidden = flowSequence({ ...flow, bodies: false }, fromDiagram(diagram)).rows.find(
      (row) => row.kind === 'message',
    )!
    expect(hidden.kind === 'message' && hidden.body).toBe('')
  })
})

describe('flowToMermaidSequence', () => {
  it('writes calls, replies, failures, notes and latencies, and escapes Mermaid syntax', () => {
    const { content, flow } = shop()
    expect(flowToMermaidSequence(flow, content)).toBe(
      [
        'sequenceDiagram',
        '    title Place #35;1#59; pay',
        '    participant browser as Browser',
        '    participant orders_api as Orders API',
        '    participant p_end as end',
        '    Note over browser: POST /orders<br/>The shopper presses Pay.',
        '    browser->>orders_api: HTTPS (38 ms)',
        '    orders_api->>p_end: INSERT orders (4 ms)',
        '    Note over orders_api,p_end: Write the #lt;order#gt; row.',
        '    p_end--xorders_api: deadlock',
        '    orders_api-->>browser: 500',
        '',
      ].join('\n'),
    )
  })
})
