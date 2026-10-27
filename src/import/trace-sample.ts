interface SampleSpan {
  service: string
  id: string
  parent?: string
  name: string
  kind: 2 | 3 | 4 | 5
  startMs: number
  durationMs: number
  attributes?: Record<string, string | number>
}

const TRACE_ID = '5b8efff798038103d269b633813fc60c'
const START_NS = 1_761_552_000_000_000_000n

const SPANS: SampleSpan[] = [
  {
    service: 'browser',
    id: '0000000000000001',
    name: 'POST /orders',
    kind: 3,
    startMs: 0,
    durationMs: 412,
    attributes: { 'http.request.method': 'POST', 'url.full': 'https://checkout.shop.dev/orders' },
  },
  {
    service: 'api-gateway',
    id: '0000000000000002',
    parent: '0000000000000001',
    name: 'POST /orders',
    kind: 2,
    startMs: 6,
    durationMs: 398,
    attributes: { 'http.request.method': 'POST', 'http.route': '/orders', 'http.response.status_code': 201 },
  },
  {
    service: 'api-gateway',
    id: '0000000000000003',
    parent: '0000000000000002',
    name: 'orders.v1.Orders/CreateOrder',
    kind: 3,
    startMs: 10,
    durationMs: 384,
    attributes: { 'rpc.system': 'grpc', 'rpc.grpc.status_code': 0 },
  },
  {
    service: 'orders',
    id: '0000000000000004',
    parent: '0000000000000003',
    name: 'orders.v1.Orders/CreateOrder',
    kind: 2,
    startMs: 12,
    durationMs: 380,
    attributes: { 'rpc.system': 'grpc', 'rpc.grpc.status_code': 0 },
  },
  {
    service: 'orders',
    id: '0000000000000005',
    parent: '0000000000000004',
    name: 'POST /v1/payment_intents',
    kind: 3,
    startMs: 20,
    durationMs: 120,
    attributes: {
      'http.request.method': 'POST',
      'url.full': 'https://api.stripe.com/v1/payment_intents',
      'server.address': 'api.stripe.com',
      'http.response.status_code': 429,
    },
  },
  {
    service: 'orders',
    id: '0000000000000006',
    parent: '0000000000000004',
    name: 'POST /v1/payment_intents',
    kind: 3,
    startMs: 150,
    durationMs: 190,
    attributes: {
      'http.request.method': 'POST',
      'url.full': 'https://api.stripe.com/v1/payment_intents',
      'server.address': 'api.stripe.com',
      'http.response.status_code': 200,
    },
  },
  {
    service: 'orders',
    id: '0000000000000007',
    parent: '0000000000000004',
    name: 'INSERT orders',
    kind: 3,
    startMs: 344,
    durationMs: 4,
    attributes: { 'db.system.name': 'postgresql', 'db.namespace': 'orders', 'db.operation.name': 'INSERT' },
  },
  {
    service: 'orders',
    id: '0000000000000008',
    parent: '0000000000000004',
    name: 'publish order.created',
    kind: 4,
    startMs: 350,
    durationMs: 3,
    attributes: { 'messaging.system': 'kafka', 'messaging.destination.name': 'order.created' },
  },
  {
    service: 'email-worker',
    id: '0000000000000009',
    parent: '0000000000000008',
    name: 'process order.created',
    kind: 5,
    startMs: 368,
    durationMs: 140,
    attributes: { 'messaging.system': 'kafka', 'messaging.destination.name': 'order.created' },
  },
]

function attributes(values: Record<string, string | number>) {
  return Object.entries(values).map(([key, value]) => ({
    key,
    value: typeof value === 'number' ? { intValue: String(value) } : { stringValue: value },
  }))
}

function nanos(ms: number): string {
  return String(START_NS + BigInt(Math.round(ms * 1_000_000)))
}

/** Returns a checkout trace in OTLP JSON. Its services have the names of the cards in the Order system template. */
export function sampleTrace(): string {
  const services = [...new Set(SPANS.map((span) => span.service))]
  const resourceSpans = services.map((service) => ({
    resource: {
      attributes: attributes({
        'service.name': service,
        ...(service === 'browser' ? { 'telemetry.sdk.language': 'webjs' } : {}),
      }),
    },
    scopeSpans: [
      {
        scope: { name: 'sample' },
        spans: SPANS.filter((span) => span.service === service).map((span) => ({
          traceId: TRACE_ID,
          spanId: span.id,
          parentSpanId: span.parent ?? '',
          name: span.name,
          kind: span.kind,
          startTimeUnixNano: nanos(span.startMs),
          endTimeUnixNano: nanos(span.startMs + span.durationMs),
          attributes: attributes(span.attributes ?? {}),
          status: { code: 0 },
        })),
      },
    ],
  }))
  return JSON.stringify({ resourceSpans }, null, 2)
}
