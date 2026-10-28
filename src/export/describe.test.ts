import { describe, expect, it } from 'vitest'
import { fromDiagram } from '@/persistence/serialize'
import { TEMPLATES } from '@/templates'
import { DiagramBuilder, edgeStep, nodeStep } from '@/templates/builder'
import { describeDiagram, descriptionParagraph, descriptionText, svgWithDescription } from './describe'

function shop() {
  const b = new DiagramBuilder()
  b.text(0, -120, { text: 'Shop', size: 'xl' })
  b.text(0, -72, { text: 'How an order\nreaches the warehouse.' })
  const vpc = b.group(240, 0, 900, 400, { kind: 'aws.vpc', label: 'shop', detail: '10.0.0.0/16' })
  const browser = b.card(0, 100, { form: 'client', title: 'Browser', lines: ['checkout.shop.dev'] })
  const api = b.card(40, 100, { title: 'Orders API', lines: ['Go · {3} replicas'], status: 'warn' }, 216, vpc)
  const db = b.card(400, 40, { form: 'datastore', title: 'Postgres' }, 216, vpc)
  const topic = b.card(400, 200, { form: 'queue', title: 'order.created', badge: '2' }, 216, vpc)
  const check = b.shape(1300, 100, 120, 120, { shape: 'diamond', label: 'In stock?' })
  const toApi = b.edge(browser, api, { label: 'HTTPS' })
  const toDb = b.edge(api, db, { label: 'SQL', markerStart: 'arrow' })
  const toTopic = b.edge(api, topic, { label: 'publish' })
  b.edge(check, topic, { markerEnd: 'none', markerStart: 'arrow' })
  b.edge(topic, check, { markerEnd: 'none' })
  const flow = b.flow('Place an order', [
    nodeStep(browser, 'The shopper presses Pay.', 1300, 'fit', 1, { event: 'POST /orders' }),
    edgeStep(toApi, '', 1200, 'follow', 1, { latencyMs: 38 }),
    { ...edgeStep(toDb, 'Write the order and tell the others.'), parallel: [{ kind: 'edge', id: toTopic }] },
    nodeStep(api, ''),
    edgeStep(toApi, '', 1200, 'follow', 1, { event: '201' }),
  ])
  b.path(
    flow,
    'Database down',
    1,
    [edgeStep(toDb, '', 1200, 'follow', 1, { event: 'timeout', latencyMs: 5000, level: 'error' })],
    3,
  )
  b.path(flow, 'Shopper leaves', 0, [])
  b.flow('Empty', [])
  return b.build('Shop')
}

describe('describeDiagram', () => {
  it('describes the boundaries, the parts, the connections and each flow and path', () => {
    const diagram = shop()
    expect(
      descriptionText(describeDiagram({ ...fromDiagram(diagram), name: diagram.name, flows: diagram.flows })),
    ).toBe(
      [
        'Shop',
        'The diagram has 5 parts, 1 boundary, 5 connections and 2 flows.',
        '',
        'Notes:',
        '- How an order reaches the warehouse.',
        '',
        'Boundaries:',
        '- AWS VPC shop (10.0.0.0/16): Orders API, Postgres, order.created',
        '',
        'Parts:',
        '- Browser: client, checkout.shop.dev',
        '- Orders API: service, Go · 3 replicas, status warning',
        '- Postgres: data store',
        '- order.created: queue, badge 2',
        '- In stock?: diamond',
        '',
        'Connections:',
        '- Browser → Orders API: HTTPS',
        '- Orders API ↔ Postgres: SQL',
        '- Orders API → order.created: publish',
        '- order.created — In stock?',
        '- order.created → In stock?',
        '',
        'Flow “Place an order”:',
        '1. Browser: POST /orders — The shopper presses Pay.',
        '2. Browser → Orders API: HTTPS (38 ms)',
        '3. Orders API → Postgres, order.created: SQL — Write the order and tell the others.',
        '4. Orders API',
        '5. Orders API → Browser: 201',
        '',
        'Path “Database down” of “Place an order”, after step 2:',
        '1. Orders API → Postgres: timeout (5000 ms, error)',
        'Then the flow continues at step 4.',
        '',
        'Path “Shopper leaves” of “Place an order”, after step 1:',
        'Then the flow ends.',
        '',
        'Flow “Empty”:',
        'The flow has no steps.',
        '',
      ].join('\n'),
    )
  })

  it('names an empty diagram', () => {
    expect(describeDiagram({ name: ' ', nodes: [], edges: [], flows: [] })).toEqual({
      name: 'Untitled diagram',
      summary: 'The diagram is empty.',
      sections: [],
    })
  })

  it('describes every step of each template flow', () => {
    for (const template of TEMPLATES) {
      const diagram = template.build()
      const description = describeDiagram({ ...fromDiagram(diagram), name: diagram.name, flows: diagram.flows })
      const steps = description.sections.filter((section) => section.title.startsWith('Flow '))
      expect(
        steps.map((section) => section.items.length),
        template.id,
      ).toEqual(diagram.flows.map((flow) => flow.steps.length))
      expect(descriptionText(description), template.id).not.toContain('Missing node')
    }
  })
})

describe('descriptionParagraph', () => {
  it('writes the description as one paragraph', () => {
    const diagram = shop()
    const paragraph = descriptionParagraph(
      describeDiagram({ ...fromDiagram(diagram), name: diagram.name, flows: diagram.flows }),
    )
    expect(paragraph).not.toContain('\n')
    expect(paragraph).toContain(
      'Shop. The diagram has 5 parts, 1 boundary, 5 connections and 2 flows. Notes: How an order reaches the warehouse. ',
    )
    expect(paragraph).toContain('Parts: Browser: client, checkout.shop.dev; Orders API: service,')
    expect(paragraph).toContain(
      'Flow “Place an order”: 1. Browser: POST /orders — The shopper presses Pay. 2. Browser → Orders API: HTTPS (38 ms). ',
    )
    expect(paragraph).toContain('Path “Shopper leaves” of “Place an order”, after step 1: Then the flow ends. ')
    expect(paragraph.endsWith('Flow “Empty”: The flow has no steps.')).toBe(true)
  })
})

describe('svgWithDescription', () => {
  it('puts the name and the text first in the SVG element', async () => {
    const description = { name: 'A < B & C', summary: 'The diagram is empty.', sections: [] }
    const svg = new Blob(['<?xml version="1.0"?><svg width="2"><g/></svg>'], { type: 'image/svg+xml' })
    expect(await (await svgWithDescription(svg, description)).text()).toBe(
      '<?xml version="1.0"?><svg width="2"><title>A &lt; B &amp; C</title>' +
        '<desc>A &lt; B &amp; C\nThe diagram is empty.\n</desc><g/></svg>',
    )
  })
})
