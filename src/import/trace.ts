import type { CardForm, LogLevel } from '@/model/schema'
import type { Protocol } from '@/model/protocols'

export const SPAN_KINDS = ['internal', 'server', 'client', 'producer', 'consumer'] as const
export type SpanKind = (typeof SPAN_KINDS)[number]

type AttributeValue = string | number | boolean

export interface TraceSpan {
  traceId: string
  spanId: string
  parentId: string | null
  service: string
  name: string
  kind: SpanKind
  startUs: number
  durationUs: number
  error: boolean
  /** The status message of a failed span, or an empty string. */
  message: string
  /** The resource attributes and then the span attributes. A span attribute wins over a resource attribute. */
  attributes: ReadonlyMap<string, AttributeValue>
}

export interface Trace {
  id: string
  spans: TraceSpan[]
}

export class TraceImportError extends Error {}

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function text(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  return ''
}

function count(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(text(value))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function nanosToMicros(value: unknown): number {
  if (typeof value === 'number') return value / 1000
  const digits = text(value)
  return /^\d+$/.test(digits) ? Number(BigInt(digits) / 1000n) : 0
}

const UNKNOWN_SERVICE = 'unknown service'

const OTLP_KINDS: Record<string, SpanKind> = {
  1: 'internal',
  2: 'server',
  3: 'client',
  4: 'producer',
  5: 'consumer',
  SPAN_KIND_INTERNAL: 'internal',
  SPAN_KIND_SERVER: 'server',
  SPAN_KIND_CLIENT: 'client',
  SPAN_KIND_PRODUCER: 'producer',
  SPAN_KIND_CONSUMER: 'consumer',
}

function spanKind(value: unknown): SpanKind {
  const name = text(value).toLowerCase()
  return SPAN_KINDS.find((kind) => kind === name) ?? 'internal'
}

function otlpAttributes(value: unknown): Map<string, AttributeValue> {
  const attributes = new Map<string, AttributeValue>()
  for (const entry of list(value)) {
    if (!isRecord(entry) || typeof entry.key !== 'string' || !isRecord(entry.value)) continue
    const { stringValue, boolValue, intValue, doubleValue } = entry.value
    const read = stringValue ?? boolValue ?? intValue ?? doubleValue
    if (typeof read === 'string' || typeof read === 'number' || typeof read === 'boolean')
      attributes.set(entry.key, read)
  }
  return attributes
}

function otlpSpan(value: unknown, service: string, resource: ReadonlyMap<string, AttributeValue>): TraceSpan[] {
  if (!isRecord(value)) return []
  const spanId = text(value.spanId)
  if (!spanId) return []
  const startUs = nanosToMicros(value.startTimeUnixNano)
  const endUs = nanosToMicros(value.endTimeUnixNano)
  const status = isRecord(value.status) ? value.status : {}
  return [
    {
      traceId: text(value.traceId),
      spanId,
      parentId: text(value.parentSpanId) || null,
      service,
      name: text(value.name),
      kind: OTLP_KINDS[text(value.kind)] ?? 'internal',
      startUs,
      durationUs: Math.max(0, endUs - startUs),
      error: status.code === 2 || status.code === 'STATUS_CODE_ERROR',
      message: text(status.message),
      attributes: new Map([...resource, ...otlpAttributes(value.attributes)]),
    },
  ]
}

function otlpResourceSpans(value: unknown): TraceSpan[] {
  if (!isRecord(value)) return []
  const resource = otlpAttributes(isRecord(value.resource) ? value.resource.attributes : undefined)
  const service = text(resource.get('service.name')) || UNKNOWN_SERVICE
  const scopes = value.scopeSpans ?? value.instrumentationLibrarySpans
  return list(scopes).flatMap((scope) =>
    list(isRecord(scope) ? scope.spans : undefined).flatMap((span) => otlpSpan(span, service, resource)),
  )
}

function jaegerTags(value: unknown): Map<string, AttributeValue> {
  const tags = new Map<string, AttributeValue>()
  for (const tag of list(value)) {
    if (!isRecord(tag) || typeof tag.key !== 'string') continue
    const read = tag.value
    if (typeof read === 'string' || typeof read === 'number' || typeof read === 'boolean') tags.set(tag.key, read)
  }
  return tags
}

function jaegerSpan(value: unknown, processes: JsonRecord): TraceSpan[] {
  if (!isRecord(value)) return []
  const spanId = text(value.spanID)
  if (!spanId) return []
  const process = isRecord(processes[text(value.processID)]) ? (processes[text(value.processID)] as JsonRecord) : {}
  const tags = jaegerTags(value.tags)
  const references = list(value.references).filter(isRecord)
  const parent = references.find((reference) => reference.refType === 'CHILD_OF') ?? references[0]
  const errorTag = tags.get('error')
  return [
    {
      traceId: text(value.traceID),
      spanId,
      parentId: text(parent?.spanID) || text(value.parentSpanID) || null,
      service: text(process.serviceName) || UNKNOWN_SERVICE,
      name: text(value.operationName),
      kind: spanKind(tags.get('span.kind')),
      startUs: count(value.startTime),
      durationUs: count(value.duration),
      error: errorTag === true || errorTag === 'true' || tags.get('otel.status_code') === 'ERROR',
      message: text(tags.get('otel.status_description')) || text(tags.get('error.message')),
      attributes: new Map([...jaegerTags(process.tags), ...tags]),
    },
  ]
}

function jaegerTrace(value: unknown): TraceSpan[] {
  if (!isRecord(value)) return []
  const processes = isRecord(value.processes) ? value.processes : {}
  return list(value.spans).flatMap((span) => jaegerSpan(span, processes))
}

interface ZipkinSpan extends TraceSpan {
  shared: boolean
}

function zipkinSpan(value: unknown): ZipkinSpan[] {
  if (!isRecord(value)) return []
  const spanId = text(value.id)
  if (!spanId) return []
  const local = isRecord(value.localEndpoint) ? value.localEndpoint : {}
  const remote = isRecord(value.remoteEndpoint) ? value.remoteEndpoint : {}
  const attributes = new Map<string, AttributeValue>()
  const remoteService = text(remote.serviceName)
  if (remoteService) attributes.set('peer.service', remoteService)
  if (isRecord(value.tags)) {
    for (const [key, tag] of Object.entries(value.tags)) if (typeof tag === 'string') attributes.set(key, tag)
  }
  const errorTag = attributes.get('error')
  return [
    {
      traceId: text(value.traceId),
      spanId,
      parentId: text(value.parentId) || null,
      service: text(local.serviceName) || UNKNOWN_SERVICE,
      name: text(value.name),
      kind: spanKind(value.kind),
      startUs: count(value.timestamp),
      durationUs: count(value.duration),
      error: errorTag !== undefined,
      message: errorTag === 'true' || errorTag === '' ? '' : text(errorTag),
      attributes,
      shared: value.shared === true,
    },
  ]
}

// Zipkin gives the server half of a shared span the id of its client half.
function unshareZipkinSpans(spans: ZipkinSpan[]): TraceSpan[] {
  const unshared = new Set(spans.filter((span) => !span.shared).map((span) => `${span.traceId}/${span.spanId}`))
  return spans.map(({ shared, ...span }) =>
    shared && unshared.has(`${span.traceId}/${span.spanId}`)
      ? { ...span, spanId: `${span.spanId}:server`, parentId: span.spanId }
      : span,
  )
}

function readSpans(data: unknown): TraceSpan[] {
  if (Array.isArray(data)) {
    return unshareZipkinSpans(
      data.flatMap((item) => (Array.isArray(item) ? item.flatMap(zipkinSpan) : zipkinSpan(item))),
    )
  }
  if (!isRecord(data)) return []
  const otlp = data.resourceSpans ?? data.batches ?? (isRecord(data.result) ? data.result.resourceSpans : undefined)
  if (Array.isArray(otlp)) return otlp.flatMap(otlpResourceSpans)
  if (Array.isArray(data.data)) return data.data.flatMap(jaegerTrace)
  if (Array.isArray(data.spans)) return jaegerTrace(data)
  return []
}

/**
 * Reads the traces in an OpenTelemetry (OTLP JSON), Jaeger or Zipkin v2 file.
 *
 * @returns The traces, the trace with the most spans first.
 * @throws TraceImportError If the text is not JSON or holds no spans.
 */
export function parseTraces(source: string): Trace[] {
  let data: unknown
  try {
    data = JSON.parse(source)
  } catch {
    throw new TraceImportError('The trace is not valid JSON.')
  }
  const spans = readSpans(data)
  if (spans.length === 0) {
    throw new TraceImportError('The file holds no spans. Use a trace from OpenTelemetry (OTLP JSON), Jaeger or Zipkin.')
  }
  const traces = new Map<string, TraceSpan[]>()
  for (const span of spans) {
    let members = traces.get(span.traceId)
    if (!members) traces.set(span.traceId, (members = []))
    members.push(span)
  }
  return [...traces]
    .map(([id, members]) => ({ id, spans: members.toSorted((a, b) => a.startUs - b.startUs) }))
    .toSorted((a, b) => b.spans.length - a.spans.length)
}

/** A part of the system that a trace reaches: a service, a database, a topic or an outside host. */
export interface TracePeer {
  key: string
  title: string
  form: CardForm
  /** The product, such as `PostgreSQL` or `Kafka`, or an empty string. */
  product: string
  lines: string[]
}

export interface TraceCall {
  /** The key of the peer that sends the request. */
  from: string
  /** The key of the peer that gets the request. */
  to: string
  /** The operation, for example `POST /orders` or `SELECT orders`. */
  operation: string
  /** The edge label for a new edge, for example `HTTPS`, `gRPC` or `SQL`. */
  label: string
  protocol: Protocol | null
  latencyMs: number
  /** The response status, for example `200` or `NOT_FOUND`, or an empty string. */
  status: string
  level: LogLevel
  /** The error message of a failed call, or an empty string. */
  message: string
  /** If true, no response comes back, as for a message that a consumer takes from a topic. */
  oneWay: boolean
  /** The number of equal calls in a row that this call stands for. */
  count: number
  /** The calls that the receiver makes while it handles this call. */
  calls: TraceCall[]
}

/** A span without a parent in the trace, and the calls under it. */
export interface TraceRoot {
  peer: string
  operation: string
  latencyMs: number
  level: LogLevel
  calls: TraceCall[]
  /** The one-way calls, such as messages that consumers take from a topic. They play after the other calls. */
  later: TraceCall[]
}

export interface TraceWalk {
  traceId: string
  peers: TracePeer[]
  roots: TraceRoot[]
  spanCount: number
}

function attribute(span: TraceSpan, ...keys: string[]): string {
  for (const key of keys) {
    const value = text(span.attributes.get(key))
    if (value) return value
  }
  return ''
}

const ACRONYMS = new Set([
  'ai',
  'api',
  'aws',
  'bff',
  'cdn',
  'cms',
  'crm',
  'db',
  'dns',
  'gcp',
  'grpc',
  'http',
  'iam',
  'id',
  'ml',
  'rpc',
  'sql',
  'sso',
  'ui',
])

/** Converts a service name such as `api-gateway` into a card title such as `API gateway`. */
export function serviceTitle(name: string): string {
  const words = name.split(/[\s_.-]+/).filter(Boolean)
  if (words.length === 0) return name
  return words
    .map((word, index) => {
      if (ACRONYMS.has(word.toLowerCase())) return word.toUpperCase()
      return index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word
    })
    .join(' ')
}

const PRODUCTS: Record<string, string> = {
  'aws.dynamodb': 'DynamoDB',
  'aws.sqs': 'SQS',
  'aws.sns': 'SNS',
  aws_sqs: 'SQS',
  activemq: 'ActiveMQ',
  cassandra: 'Cassandra',
  clickhouse: 'ClickHouse',
  cockroachdb: 'CockroachDB',
  couchbase: 'Couchbase',
  couchdb: 'CouchDB',
  dynamodb: 'DynamoDB',
  elasticsearch: 'Elasticsearch',
  eventhubs: 'Event Hubs',
  gcp_pubsub: 'Pub/Sub',
  'gcp.pubsub': 'Pub/Sub',
  kafka: 'Kafka',
  mariadb: 'MariaDB',
  memcached: 'Memcached',
  mongodb: 'MongoDB',
  mssql: 'SQL Server',
  'microsoft.sql_server': 'SQL Server',
  mysql: 'MySQL',
  nats: 'NATS',
  opensearch: 'OpenSearch',
  oracle: 'Oracle',
  'oracle.db': 'Oracle',
  postgresql: 'PostgreSQL',
  pulsar: 'Pulsar',
  rabbitmq: 'RabbitMQ',
  redis: 'Redis',
  rocketmq: 'RocketMQ',
  servicebus: 'Service Bus',
  sqlite: 'SQLite',
  valkey: 'Valkey',
}

const SQL_SYSTEMS = new Set([
  'cockroachdb',
  'db2',
  'derby',
  'h2',
  'hsqldb',
  'ibm.db2',
  'mariadb',
  'microsoft.sql_server',
  'mssql',
  'mysql',
  'oracle',
  'oracle.db',
  'other_sql',
  'postgresql',
  'sqlite',
  'trino',
])

function productName(system: string): string {
  return PRODUCTS[system.toLowerCase()] ?? serviceTitle(system)
}

const CLIENT_LANGUAGES = new Set(['webjs', 'swift', 'kotlin'])

function servicePeer(span: TraceSpan): TracePeer {
  const client =
    CLIENT_LANGUAGES.has(attribute(span, 'telemetry.sdk.language')) || span.attributes.has('browser.platform')
  return {
    key: `service:${span.service}`,
    title: serviceTitle(span.service),
    form: client ? 'client' : 'service',
    product: '',
    lines: [],
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/** Returns the peer that a client or producer span calls when no span of the trace stands for that peer. */
function remotePeer(span: TraceSpan): TracePeer | null {
  const database = attribute(span, 'db.system.name', 'db.system')
  if (database) {
    const namespace = attribute(span, 'db.namespace', 'db.name')
    const product = productName(database)
    return {
      key: `data:${database}:${namespace}`,
      title: product,
      form: 'datastore',
      product,
      lines: namespace ? [namespace] : [],
    }
  }
  const messaging = attribute(span, 'messaging.system')
  if (messaging) {
    const destination = attribute(span, 'messaging.destination.name', 'messaging.destination')
    const product = productName(messaging)
    return {
      key: `messaging:${messaging}:${destination}`,
      title: destination || product,
      form: 'queue',
      product,
      lines: destination ? [product] : [],
    }
  }
  const peerService = attribute(span, 'peer.service')
  if (peerService) {
    return { key: `service:${peerService}`, title: serviceTitle(peerService), form: 'service', product: '', lines: [] }
  }
  const host =
    attribute(span, 'server.address', 'net.peer.name', 'http.host') || hostOf(attribute(span, 'url.full', 'http.url'))
  if (host) return { key: `host:${host}`, title: host, form: 'external', product: '', lines: [] }
  return null
}

const GRPC_STATUS = [
  'OK',
  'CANCELLED',
  'UNKNOWN',
  'INVALID_ARGUMENT',
  'DEADLINE_EXCEEDED',
  'NOT_FOUND',
  'ALREADY_EXISTS',
  'PERMISSION_DENIED',
  'RESOURCE_EXHAUSTED',
  'FAILED_PRECONDITION',
  'ABORTED',
  'OUT_OF_RANGE',
  'UNIMPLEMENTED',
  'INTERNAL',
  'UNAVAILABLE',
  'DATA_LOSS',
  'UNAUTHENTICATED',
]

const LEVEL_RANK: Record<LogLevel, number> = { info: 0, warn: 1, error: 2 }

function worse(a: LogLevel, b: LogLevel): LogLevel {
  return LEVEL_RANK[b] > LEVEL_RANK[a] ? b : a
}

interface Outcome {
  status: string
  level: LogLevel
  message: string
}

function outcome(spans: readonly TraceSpan[]): Outcome {
  let status = ''
  let level: LogLevel = 'info'
  let message = ''
  for (const span of spans) {
    const http = Number(attribute(span, 'http.response.status_code', 'http.status_code'))
    const grpc = attribute(span, 'rpc.grpc.status_code')
    if (!status && http > 0) {
      status = String(http)
      level = worse(level, http >= 500 ? 'error' : http >= 400 ? 'warn' : 'info')
    }
    if (!status && grpc !== '') {
      status = GRPC_STATUS[Number(grpc)] ?? grpc
      if (status !== 'OK') level = worse(level, 'warn')
    }
    if (span.error) {
      level = 'error'
      message ||= span.message
    }
  }
  if (!status && level === 'error') status = 'Error'
  return { status, level, message }
}

function protocolOf(spans: readonly TraceSpan[]): { protocol: Protocol | null; label: string } {
  for (const span of spans) {
    const rpc = attribute(span, 'rpc.system')
    if (rpc) return { protocol: 'rpc', label: rpc === 'grpc' ? 'gRPC' : 'RPC' }
    const database = attribute(span, 'db.system.name', 'db.system')
    if (database) {
      return { protocol: 'data', label: SQL_SYSTEMS.has(database.toLowerCase()) ? 'SQL' : productName(database) }
    }
    if (attribute(span, 'messaging.system')) {
      return { protocol: 'messaging', label: span.kind === 'consumer' ? 'consume' : 'publish' }
    }
    const url = attribute(span, 'url.full', 'http.url')
    const scheme = attribute(span, 'url.scheme', 'http.scheme') || (url.startsWith('https:') ? 'https' : '')
    if (scheme || url || attribute(span, 'http.request.method', 'http.method')) {
      return { protocol: 'http', label: scheme === 'https' ? 'HTTPS' : 'HTTP' }
    }
  }
  return { protocol: null, label: '' }
}

interface TimedCall extends TraceCall {
  startUs: number
  endUs: number
}

function canMerge(a: TimedCall, b: TimedCall): boolean {
  return (
    a.from === b.from &&
    a.to === b.to &&
    a.operation === b.operation &&
    a.oneWay === b.oneWay &&
    a.status === b.status &&
    a.level === b.level &&
    a.calls.length === 0 &&
    b.calls.length === 0
  )
}

/** Merges calls in a row with the same ends, operation and outcome into one call with a count. */
function mergeRepeats(calls: TimedCall[]): TimedCall[] {
  const merged: TimedCall[] = []
  for (const call of calls.toSorted((a, b) => a.startUs - b.startUs)) {
    const last = merged.at(-1)
    if (!last || !canMerge(last, call)) {
      merged.push(call)
      continue
    }
    const endUs = Math.max(last.endUs, call.endUs)
    merged[merged.length - 1] = {
      ...last,
      count: last.count + call.count,
      endUs,
      latencyMs: (endUs - last.startUs) / 1000,
      message: last.message || call.message,
    }
  }
  return merged
}

function stripTiming({ startUs: _start, endUs: _end, ...call }: TimedCall): TraceCall {
  return { ...call, calls: call.calls.map((child) => stripTiming(child as TimedCall)) }
}

/**
 * Converts a trace into the calls between the parts of the system, in the order that they start.
 *
 * Spans inside one service do not make calls. A client or producer span with a span of another service below it calls
 * that service. Without one, it calls the database, topic, peer service or host that its attributes name. A message
 * goes from the producer to its topic and back, and later from the topic to each consumer.
 */
export function walkTrace(trace: Trace): TraceWalk {
  const ids = new Set(trace.spans.map((span) => span.spanId))
  const children = new Map<string, TraceSpan[]>()
  for (const span of trace.spans) {
    if (span.parentId === null || !ids.has(span.parentId)) continue
    let members = children.get(span.parentId)
    if (!members) children.set(span.parentId, (members = []))
    members.push(span)
  }
  const childrenOf = (span: TraceSpan) => children.get(span.spanId) ?? []
  const peers = new Map<string, TracePeer>()
  const peer = (found: TracePeer) => {
    if (!peers.has(found.key)) peers.set(found.key, found)
    return found.key
  }
  let later: TimedCall[] = []

  const call = (from: string, to: string, spans: TraceSpan[], calls: TimedCall[], oneWay = false): TimedCall => {
    const timed = spans[0]!
    const { protocol, label } = protocolOf(spans)
    return {
      from,
      to,
      operation: spans.at(-1)!.name || timed.name,
      label,
      protocol,
      latencyMs: timed.durationUs / 1000,
      ...outcome(spans.toReversed()),
      oneWay,
      count: 1,
      calls: mergeRepeats(calls),
      startUs: timed.startUs,
      endUs: timed.startUs + timed.durationUs,
    }
  }

  function callsAmong(spans: readonly TraceSpan[], service: string, from: string): TimedCall[] {
    const calls: TimedCall[] = []
    for (const span of spans) {
      if (span.service !== service) {
        const to = peer(servicePeer(span))
        calls.push(call(from, to, [span], callsUnder(span, to)))
        continue
      }
      if (span.kind !== 'client' && span.kind !== 'producer') {
        calls.push(...callsUnder(span, from))
        continue
      }
      const below = childrenOf(span)
      const receivers = below.filter((child) => child.service !== service)
      const remote = remotePeer(span)
      if (span.kind === 'producer') {
        const topic = remote?.form === 'queue' ? peer(remote) : null
        if (topic) calls.push(call(from, topic, [span], []))
        for (const consumer of receivers) {
          const to = peer(servicePeer(consumer))
          later.push(call(topic ?? from, to, topic ? [consumer] : [span, consumer], callsUnder(consumer, to), true))
        }
      } else if (receivers.length > 0) {
        for (const receiver of receivers) {
          const to = peer(servicePeer(receiver))
          calls.push(call(from, to, [span, receiver], callsUnder(receiver, to)))
        }
      } else if (remote) {
        calls.push(call(from, peer(remote), [span], []))
      }
      calls.push(
        ...callsAmong(
          below.filter((child) => child.service === service),
          service,
          from,
        ),
      )
    }
    return calls
  }

  function callsUnder(span: TraceSpan, from: string): TimedCall[] {
    return callsAmong(childrenOf(span), span.service, from)
  }

  const roots = trace.spans
    .filter((span) => span.parentId === null || !ids.has(span.parentId))
    .map((span): TraceRoot => {
      const key = peer(servicePeer(span))
      later = []
      const calls = span.kind === 'client' ? callsAmong([span], span.service, key) : callsUnder(span, key)
      return {
        peer: key,
        operation: span.name,
        latencyMs: span.durationUs / 1000,
        level: outcome([span]).level,
        calls: mergeRepeats(calls).map(stripTiming),
        later: mergeRepeats(later).map(stripTiming),
      }
    })

  return { traceId: trace.id, peers: [...peers.values()], roots, spanCount: trace.spans.length }
}
