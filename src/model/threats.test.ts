import { describe, expect, it } from 'vitest'
import { fromDiagram } from '@/persistence/serialize'
import { DiagramBuilder } from '@/templates/builder'
import { defaultPayloadField } from './defaults'
import type { Payload, PayloadField } from './schema'
import { crossingText, dataCrossings, sensitiveFields, SYSTEM_EDGE } from './threats'

function body(...fields: Partial<PayloadField>[]): Payload {
  return { fields: fields.map((field) => defaultPayloadField(field)) }
}

function shop() {
  const b = new DiagramBuilder()
  const account = b.group(0, 0, 900, 600, { kind: 'aws.account', label: 'prod' })
  const vpc = b.group(40, 60, 800, 500, { kind: 'aws.vpc', label: 'main', parentId: account })
  const team = b.group(40, 60, 400, 300, { kind: 'custom', label: 'Team', parentId: vpc })
  const api = b.card(40, 60, { title: 'API' }, 216, team)
  const db = b.card(500, 60, { form: 'datastore', title: 'DB' }, 216, vpc)
  const browser = b.card(-400, 100, { form: 'client', title: 'Browser' })
  const stripe = b.card(1200, 100, { form: 'external', title: 'Stripe' })
  b.edge(browser, api, { request: body({ path: 'email', sensitive: 'personal' }, { path: 'remember' }) })
  b.edge(api, db, { request: body({ path: 'password', sensitive: 'secret' }) })
  b.edge(api, stripe, {
    request: body({ path: 'customer', sensitive: 'personal' }),
    response: body({ path: 'client_secret', sensitive: 'secret' }),
  })
  b.edge(api, db, { request: body({ path: 'orderId' }) })
  return fromDiagram(b.build('Shop'))
}

describe('dataCrossings', () => {
  it('lists the marked fields of each edge and the trust boundaries between its ends, outer first', () => {
    const { nodes, edges } = shop()
    expect(dataCrossings(nodes, edges)).toEqual([
      {
        edgeId: edges[0]!.id,
        fields: [{ part: 'request', path: 'email', kind: 'personal' }],
        kind: 'personal',
        boundaries: ['AWS account prod', 'AWS VPC main'],
      },
      {
        edgeId: edges[1]!.id,
        fields: [{ part: 'request', path: 'password', kind: 'secret' }],
        kind: 'secret',
        boundaries: [],
      },
      {
        edgeId: edges[2]!.id,
        fields: [
          { part: 'request', path: 'customer', kind: 'personal' },
          { part: 'response', path: 'client_secret', kind: 'secret' },
        ],
        kind: 'secret',
        boundaries: ['AWS account prod', 'AWS VPC main'],
      },
    ])
  })

  it('crosses the edge of the system between an outside card and a part when no boundary is drawn', () => {
    const b = new DiagramBuilder()
    const browser = b.card(0, 0, { form: 'client', title: 'Browser' })
    const api = b.card(300, 0, { title: 'API' })
    const worker = b.card(600, 0, { title: 'Worker' })
    const marked = body({ path: 'email', sensitive: 'personal' })
    b.edge(browser, api, { request: marked })
    b.edge(api, worker, { request: marked })
    const { nodes, edges } = fromDiagram(b.build('Plain'))
    expect(dataCrossings(nodes, edges).map((crossing) => crossing.boundaries)).toEqual([[SYSTEM_EDGE], []])
  })

  it('describes the fields and the boundaries of a crossing', () => {
    const { nodes, edges } = shop()
    const [charge] = dataCrossings(nodes, [edges[2]!])
    expect(crossingText(charge!)).toEqual({
      fields: 'customer (personal data), response client_secret (secret)',
      boundaries: 'Crosses AWS account prod and AWS VPC main.',
    })
    const [query] = dataCrossings(nodes, [edges[1]!])
    expect(crossingText(query!).boundaries).toBe('Crosses no trust boundary.')
  })

  it('finds no sensitive field on an edge without marks', () => {
    expect(sensitiveFields(shop().edges[3]?.data)).toEqual([])
    expect(sensitiveFields(undefined)).toEqual([])
  })
})
