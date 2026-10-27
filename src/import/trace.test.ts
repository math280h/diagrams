import { describe, expect, it } from 'vitest'
import { parseTraces, serviceTitle, TraceImportError, walkTrace, type TraceCall } from './trace'
import { sampleTrace } from './trace-sample'

function outline(calls: readonly TraceCall[]): unknown[] {
  return calls.map((call) => ({
    from: call.from,
    to: call.to,
    operation: call.operation,
    ...(call.count > 1 ? { count: call.count } : {}),
    ...(call.calls.length > 0 ? { calls: outline(call.calls) } : {}),
  }))
}

describe('parseTraces', () => {
  it('reads OTLP JSON with resource attributes, kinds, times and string numbers', () => {
    const [trace] = parseTraces(sampleTrace())
    expect(trace!.spans).toHaveLength(9)
    const root = trace!.spans[0]!
    expect(root).toMatchObject({ service: 'browser', kind: 'client', parentId: null, name: 'POST /orders' })
    expect(root.durationUs).toBe(412_000)
    expect(root.attributes.get('telemetry.sdk.language')).toBe('webjs')
    const gateway = trace!.spans.find((span) => span.service === 'api-gateway' && span.kind === 'server')!
    expect(gateway.attributes.get('http.response.status_code')).toBe('201')
  })

  it('reads a Jaeger trace with processes, references and tags', () => {
    const jaeger = {
      data: [
        {
          traceID: 't1',
          spans: [
            {
              traceID: 't1',
              spanID: 'a',
              operationName: 'GET /cart',
              references: [],
              startTime: 1000,
              duration: 900,
              tags: [{ key: 'span.kind', type: 'string', value: 'server' }],
              processID: 'p1',
            },
            {
              traceID: 't1',
              spanID: 'b',
              operationName: 'HGET',
              references: [{ refType: 'CHILD_OF', traceID: 't1', spanID: 'a' }],
              startTime: 1100,
              duration: 200,
              tags: [
                { key: 'span.kind', type: 'string', value: 'client' },
                { key: 'db.system', type: 'string', value: 'redis' },
                { key: 'error', type: 'bool', value: true },
                { key: 'otel.status_description', type: 'string', value: 'timeout' },
              ],
              processID: 'p1',
            },
          ],
          processes: { p1: { serviceName: 'cart', tags: [] } },
        },
      ],
    }
    const [trace] = parseTraces(JSON.stringify(jaeger))
    expect(trace!.spans.map((span) => [span.spanId, span.parentId, span.kind])).toEqual([
      ['a', null, 'server'],
      ['b', 'a', 'client'],
    ])
    expect(trace!.spans[1]).toMatchObject({ service: 'cart', error: true, message: 'timeout', durationUs: 200 })
  })

  it('reads Zipkin v2 spans and splits a shared span into its client and server halves', () => {
    const zipkin = [
      {
        traceId: 'z',
        id: '1',
        name: 'get /',
        kind: 'SERVER',
        timestamp: 10,
        duration: 100,
        localEndpoint: { serviceName: 'web' },
      },
      {
        traceId: 'z',
        id: '2',
        parentId: '1',
        name: 'get /api',
        kind: 'CLIENT',
        timestamp: 20,
        duration: 50,
        localEndpoint: { serviceName: 'web' },
        remoteEndpoint: { serviceName: 'api' },
      },
      {
        traceId: 'z',
        id: '2',
        parentId: '1',
        name: 'get /api',
        kind: 'SERVER',
        shared: true,
        timestamp: 25,
        duration: 40,
        localEndpoint: { serviceName: 'api' },
        tags: { error: 'boom' },
      },
    ]
    const [trace] = parseTraces(JSON.stringify(zipkin))
    expect(trace!.spans.map((span) => [span.spanId, span.parentId, span.service])).toEqual([
      ['1', null, 'web'],
      ['2', '1', 'web'],
      ['2:server', '2', 'api'],
    ])
    expect(trace!.spans[2]).toMatchObject({ error: true, message: 'boom' })
    expect(outline(walkTrace(trace!).roots[0]!.calls)).toEqual([
      { from: 'service:web', to: 'service:api', operation: 'get /api' },
    ])
  })

  it('puts the trace with the most spans first', () => {
    const spans = [
      { traceId: 'small', id: '1', name: 'a', timestamp: 1, duration: 1, localEndpoint: { serviceName: 's' } },
      { traceId: 'big', id: '1', name: 'b', timestamp: 1, duration: 1, localEndpoint: { serviceName: 's' } },
      {
        traceId: 'big',
        id: '2',
        parentId: '1',
        name: 'c',
        timestamp: 1,
        duration: 1,
        localEndpoint: { serviceName: 's' },
      },
    ]
    expect(parseTraces(JSON.stringify(spans)).map((trace) => trace.id)).toEqual(['big', 'small'])
  })

  it('explains text that is not a trace', () => {
    expect(() => parseTraces('{')).toThrow(TraceImportError)
    expect(() => parseTraces('{"nodes": []}')).toThrow('The file holds no spans.')
  })
})

describe('walkTrace', () => {
  it('turns the sample trace into calls between services, a database, a host and a topic', () => {
    const walk = walkTrace(parseTraces(sampleTrace())[0]!)
    expect(walk.peers.map((peer) => [peer.key, peer.title, peer.form])).toEqual([
      ['service:browser', 'Browser', 'client'],
      ['service:api-gateway', 'API gateway', 'service'],
      ['service:orders', 'Orders', 'service'],
      ['host:api.stripe.com', 'api.stripe.com', 'external'],
      ['data:postgresql:orders', 'PostgreSQL', 'datastore'],
      ['messaging:kafka:order.created', 'order.created', 'queue'],
      ['service:email-worker', 'Email worker', 'service'],
    ])
    const [root] = walk.roots
    expect(root).toMatchObject({ peer: 'service:browser', operation: 'POST /orders', latencyMs: 412 })
    expect(outline(root!.calls)).toEqual([
      {
        from: 'service:browser',
        to: 'service:api-gateway',
        operation: 'POST /orders',
        calls: [
          {
            from: 'service:api-gateway',
            to: 'service:orders',
            operation: 'orders.v1.Orders/CreateOrder',
            calls: [
              { from: 'service:orders', to: 'host:api.stripe.com', operation: 'POST /v1/payment_intents' },
              { from: 'service:orders', to: 'host:api.stripe.com', operation: 'POST /v1/payment_intents' },
              { from: 'service:orders', to: 'data:postgresql:orders', operation: 'INSERT orders' },
              { from: 'service:orders', to: 'messaging:kafka:order.created', operation: 'publish order.created' },
            ],
          },
        ],
      },
    ])
    expect(outline(root!.later)).toEqual([
      {
        from: 'messaging:kafka:order.created',
        to: 'service:email-worker',
        operation: 'process order.created',
      },
    ])
  })

  it('reads the protocol, status and level of each call', () => {
    const [root] = walkTrace(parseTraces(sampleTrace())[0]!).roots
    const gateway = root!.calls[0]!
    expect(gateway).toMatchObject({ label: 'HTTPS', protocol: 'http', status: '201', level: 'info' })
    const orders = gateway.calls[0]!
    expect(orders).toMatchObject({ label: 'gRPC', protocol: 'rpc', status: 'OK', latencyMs: 384 })
    const [rateLimited, charged, insert, publish] = orders.calls
    expect(rateLimited).toMatchObject({ label: 'HTTPS', status: '429', level: 'warn', latencyMs: 120 })
    expect(charged).toMatchObject({ status: '200', level: 'info' })
    expect(insert).toMatchObject({ label: 'SQL', protocol: 'data', status: '' })
    expect(publish).toMatchObject({ label: 'publish', protocol: 'messaging', oneWay: false })
    expect(root!.later[0]).toMatchObject({ label: 'consume', oneWay: true, latencyMs: 140 })
  })

  it('merges equal calls in a row into one call with a count and the time from the first start to the last end', () => {
    const span = (id: string, startTime: number, parent = 'root') => ({
      traceID: 't',
      spanID: id,
      operationName: id === 'root' ? 'GET /products' : 'SELECT products',
      references: id === 'root' ? [] : [{ refType: 'CHILD_OF', spanID: parent }],
      startTime,
      duration: 1000,
      tags:
        id === 'root'
          ? [{ key: 'span.kind', value: 'server' }]
          : [
              { key: 'span.kind', value: 'client' },
              { key: 'db.system', value: 'mysql' },
            ],
      processID: 'p',
    })
    const trace = {
      traceID: 't',
      spans: [span('root', 0), span('q1', 1000), span('q2', 2500), span('q3', 4000)],
      processes: { p: { serviceName: 'catalog' } },
    }
    const [call] = walkTrace(parseTraces(JSON.stringify(trace))[0]!).roots[0]!.calls
    expect(call).toMatchObject({ operation: 'SELECT products', count: 3, latencyMs: 4, to: 'data:mysql:' })
  })

  it('marks a failed call as an error with its message', () => {
    const otlp = {
      resourceSpans: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'checkout' } }] },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: 't',
                  spanId: 'a',
                  name: 'PlaceOrder',
                  kind: 2,
                  startTimeUnixNano: '0',
                  endTimeUnixNano: '9000000',
                },
                {
                  traceId: 't',
                  spanId: 'b',
                  parentSpanId: 'a',
                  name: 'Charge',
                  kind: 'SPAN_KIND_CLIENT',
                  startTimeUnixNano: '1000000',
                  endTimeUnixNano: '8000000',
                  attributes: [
                    { key: 'rpc.system', value: { stringValue: 'grpc' } },
                    { key: 'peer.service', value: { stringValue: 'payment' } },
                    { key: 'rpc.grpc.status_code', value: { intValue: '14' } },
                  ],
                  status: { code: 'STATUS_CODE_ERROR', message: 'connection refused' },
                },
              ],
            },
          ],
        },
      ],
    }
    const [call] = walkTrace(parseTraces(JSON.stringify(otlp))[0]!).roots[0]!.calls
    expect(call).toMatchObject({
      to: 'service:payment',
      status: 'UNAVAILABLE',
      level: 'error',
      message: 'connection refused',
      latencyMs: 7,
    })
  })
})

describe('serviceTitle', () => {
  it('writes service names as titles in sentence case and keeps acronyms', () => {
    expect(serviceTitle('api-gateway')).toBe('API gateway')
    expect(serviceTitle('email_worker')).toBe('Email worker')
    expect(serviceTitle('checkoutservice')).toBe('Checkoutservice')
  })
})
