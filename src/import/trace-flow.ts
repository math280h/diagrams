import { matchIcon, type IconSet } from '@/canvas/icons/library'
import { createStep } from '@/editor/flow/record'
import { createEdge, createFlow, defaultCardData, newId } from '@/model/defaults'
import { ELEMENT_Z } from '@/model/graph'
import { matchPreset } from '@/model/presets'
import type { CardForm, Flow, Step } from '@/model/schema'
import type { CardNodeType, DiagramEdge, DiagramNode } from '@/model/types'
import type { TraceCall, TracePeer, TraceWalk } from './trace'

export interface TraceFlowPlan {
  /** New cards for the peers that no card of the diagram stands for. They have no position yet. */
  nodes: DiagramNode[]
  /** New edges for the calls that no edge of the diagram carries. */
  edges: DiagramEdge[]
  flow: Flow
  /** The number of peers that an existing card stands for. */
  matched: number
}

const FORM_ICONS: Record<CardForm, string> = {
  service: 'server',
  datastore: 'database',
  queue: 'layers',
  client: 'monitor',
  external: 'plug',
  function: 'zap',
}

const IGNORED_WORDS = new Set(['the', 'service', 'svc', 'server', 'api', 'app', 'db', 'database'])
const IGNORED_SUFFIXES = ['service', 'server', 'svc']
const HOST_WORDS = new Set(['api', 'www', 'com', 'io', 'net', 'org', 'dev', 'co', 'app', 'cloud'])

/** Returns a key that is the same for `Order service`, `orders`, `order-service` and `orderservice`. */
export function matchKey(name: string): string {
  const words = name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((word) => {
      const suffix = IGNORED_SUFFIXES.find(
        (candidate) => word.length > candidate.length + 2 && word.endsWith(candidate),
      )
      return suffix ? word.slice(0, -suffix.length) : word
    })
  const kept = words.filter((word) => !IGNORED_WORDS.has(word))
  return (kept.length > 0 ? kept : words).map((word) => (word.length > 3 ? word.replace(/s$/, '') : word)).join('')
}

function peerKeys(peer: TracePeer): string[] {
  const names = [peer.title, ...peer.lines]
  if (peer.form === 'external') {
    const words = peer.title.split('.').filter((word) => !HOST_WORDS.has(word))
    names.push(...words)
  }
  if (peer.product) names.push(peer.product)
  return [...new Set(names.map(matchKey).filter(Boolean))]
}

function prefersForm(peer: TracePeer, form: CardForm): boolean {
  if (peer.form === 'datastore' || peer.form === 'queue') return form === peer.form
  return form !== 'datastore' && form !== 'queue'
}

/**
 * Returns the card that stands for the peer.
 *
 * Cards of a fitting form come first: by title, then for a database or a topic by a card line, then by the product
 * icon. Cards of other forms match only by title, and for a database or a topic not by its namespace.
 */
function findCard(peer: TracePeer, cards: readonly CardNodeType[], productIcon: string): CardNodeType | undefined {
  const keys = peerKeys(peer)
  const typed = peer.form === 'datastore' || peer.form === 'queue'
  const strictKeys = typed ? [peer.title, peer.product].filter(Boolean).map(matchKey) : keys
  const fitting = cards.filter((card) => prefersForm(peer, card.data.form))
  const byIcon = productIcon ? fitting.filter((card) => card.data.icon === productIcon) : []
  return (
    fitting.find((card) => keys.includes(matchKey(card.data.title))) ??
    (typed ? fitting.find((card) => card.data.lines.some((line) => keys.includes(matchKey(line.text)))) : undefined) ??
    (byIcon.length === 1 ? byIcon[0] : undefined) ??
    cards.find((card) => !prefersForm(peer, card.data.form) && strictKeys.includes(matchKey(card.data.title)))
  )
}

function createCard(peer: TracePeer, iconSets: readonly IconSet[]): DiagramNode {
  const product = matchIcon(iconSets, peer.product || peer.title)
  const icon = product?.id ?? matchPreset(peer.title)?.icon ?? FORM_ICONS[peer.form]
  return {
    id: newId('n'),
    type: 'card',
    zIndex: ELEMENT_Z,
    position: { x: 0, y: 0 },
    width: 216,
    data: defaultCardData({
      title: peer.title,
      form: peer.form,
      icon,
      lines: peer.lines.map((line) => ({ id: newId('l'), text: line })),
    }),
  }
}

function roundMs(value: number): number {
  return value >= 10 ? Math.round(value) : Math.round(value * 10) / 10
}

/**
 * Plans a flow that plays a trace on a diagram.
 *
 * Each peer of the trace uses the card that stands for it, or a new card. Each call uses an edge between its two cards,
 * or a new edge. A call is a request step and, unless it is one way, a response step after the calls under it. Each
 * root span adds a step on its node, its calls, and then its one-way calls.
 */
export function planTraceFlow(
  walk: TraceWalk,
  diagram: { nodes: readonly DiagramNode[]; edges: readonly DiagramEdge[] },
  iconSets: readonly IconSet[],
): TraceFlowPlan {
  const cards = diagram.nodes.filter((node): node is CardNodeType => node.type === 'card')
  const nodes: DiagramNode[] = []
  const nodeOf = new Map<string, string>()
  let matched = 0
  for (const peer of walk.peers) {
    const productIcon = peer.product ? (matchIcon(iconSets, peer.product)?.id ?? '') : ''
    const card = findCard(peer, cards, productIcon)
    if (card) {
      nodeOf.set(peer.key, card.id)
      matched++
      continue
    }
    const created = createCard(peer, iconSets)
    nodes.push(created)
    nodeOf.set(peer.key, created.id)
  }

  const edges: DiagramEdge[] = []
  const known = [...diagram.edges]
  const edgeFor = (source: string, target: string, call: TraceCall): string => {
    const found =
      known.find((edge) => edge.source === source && edge.target === target) ??
      known.find((edge) => edge.source === target && edge.target === source)
    if (found) return found.id
    const created = createEdge(source, target, { label: call.label, protocol: call.protocol ?? 'auto' })
    edges.push(created)
    known.push(created)
    return created.id
  }

  const steps: Step[] = []
  const play = (calls: readonly TraceCall[]) => {
    for (const call of calls) {
      const source = nodeOf.get(call.from)!
      const target = nodeOf.get(call.to)!
      if (source === target) {
        play(call.calls)
        continue
      }
      const edge = edgeFor(source, target, call)
      steps.push({
        ...createStep({ kind: 'edge', id: edge }),
        event: call.count > 1 ? `${call.operation} ×${call.count}` : call.operation,
        latencyMs: roundMs(call.latencyMs),
        level: call.oneWay ? call.level : 'info',
        caption: call.oneWay ? call.message : '',
      })
      play(call.calls)
      if (call.oneWay) continue
      steps.push({
        ...createStep({ kind: 'edge', id: edge }),
        event: call.status || 'OK',
        level: call.level,
        caption: call.message,
      })
    }
  }
  for (const root of walk.roots) {
    steps.push({
      ...createStep({ kind: 'node', id: nodeOf.get(root.peer)! }),
      event: root.operation,
      latencyMs: roundMs(root.latencyMs),
      level: root.level,
    })
    play(root.calls)
    play(root.later)
  }

  const flow = createFlow(walk.roots[0]?.operation || 'Trace')
  flow.token = { label: 'Request', icon: 'activity', shape: 'chip' }
  flow.steps = steps
  return { nodes, edges, flow, matched }
}
