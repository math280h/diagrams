import type { EdgeData } from './schema'

export const PROTOCOLS = ['http', 'rpc', 'data', 'messaging'] as const
export type Protocol = (typeof PROTOCOLS)[number]

export const PROTOCOL_LABELS: Record<Protocol, string> = {
  http: 'HTTP',
  rpc: 'RPC',
  data: 'Database',
  messaging: 'Messaging',
}

const PATTERNS: [Protocol, RegExp][] = [
  ['rpc', /\b(g?rpc|trpc|thrift|soap)\b/i],
  ['messaging', /\b(publish|consume|produce|subscribe|kafka|amqp|mqtt|sqs|sns|events?|stream|queue|poll)\b/i],
  ['data', /\b(sql|query|select|insert|cdc|replication|redis|cache|putitem|getitem|jdbc|odbc)\b/i],
  ['http', /\b(https?(\/[\d.]+)?|rest|graphql|websockets?|wss?|oidc|oauth2?|odata)\b/i],
]

/** Returns the protocol that an edge label names, or `null` if the label names none. */
export function detectProtocol(label: string): Protocol | null {
  for (const [protocol, pattern] of PATTERNS) if (pattern.test(label)) return protocol
  return null
}

/** Returns the protocol of an edge: the chosen one, or the one that the label names with `auto`. */
export function edgeProtocol(data: Pick<EdgeData, 'protocol' | 'label'>): Protocol | null {
  if (data.protocol === 'none') return null
  if (data.protocol === 'auto') return detectProtocol(data.label)
  return data.protocol
}
