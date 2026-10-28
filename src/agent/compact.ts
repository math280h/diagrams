import { CUSTOM_BOUNDARY } from '@/model/boundaries'
import { absoluteRect } from '@/model/graph'
import { nodeLabel } from '@/model/labels'
import type { Rect } from '@/model/rect'
import { edgeProtocol } from '@/model/protocols'
import type { Flow, NodeDetails, Payload } from '@/model/schema'
import type { DiagramEdge, DiagramNode } from '@/model/types'
import type { DocSnapshot } from '@/store/doc-store'
import { withWarnings } from './warnings'

export type DiagramContent = DocSnapshot & { id: string }

/** The smallest overlap, in canvas pixels on both axes, that counts as an overlap of two nodes. */
const OVERLAP_PX = 4

function overlaps(a: Rect, b: Rect) {
  return (
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > OVERLAP_PX &&
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > OVERLAP_PX
  )
}

function contains(outer: Rect, inner: Rect) {
  return (
    inner.x >= outer.x - 1 &&
    inner.y >= outer.y - 1 &&
    inner.x + inner.width <= outer.x + outer.width + 1 &&
    inner.y + inner.height <= outer.y + outer.height + 1
  )
}

/** Lists layout problems that an agent should fix: nodes that overlap and nodes that stick out of their group. */
export function layoutWarnings(nodes: readonly DiagramNode[]): string[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const rects = new Map(nodes.map((node) => [node.id, absoluteRect(node, byId)]))
  const warnings: string[] = []
  const elements = nodes.filter((node) => node.type !== 'group')
  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const a = elements[i]!
      const b = elements[j]!
      if (overlaps(rects.get(a.id)!, rects.get(b.id)!)) {
        warnings.push(`"${nodeLabel(a)}" (${a.id}) overlaps "${nodeLabel(b)}" (${b.id}).`)
      }
    }
  }
  for (const node of nodes) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined
    if (parent && !contains(rects.get(parent.id)!, rects.get(node.id)!)) {
      warnings.push(`"${nodeLabel(node)}" (${node.id}) sticks out of its group "${nodeLabel(parent)}" (${parent.id}).`)
    }
  }
  return warnings
}

function compactDetails(details: NodeDetails) {
  return {
    ...(details.owner ? { owner: details.owner } : {}),
    ...(details.description ? { description: details.description } : {}),
    ...(details.links.length > 0
      ? { links: details.links.map((link) => (link.label ? { label: link.label, url: link.url } : { url: link.url })) }
      : {}),
  }
}

function compactNode(node: DiagramNode, rect: Rect, full: boolean) {
  const base = {
    id: node.id,
    kind: node.type,
    label: nodeLabel(node),
    ...(node.parentId ? { parent: node.parentId } : {}),
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    w: Math.round(rect.width),
    h: Math.round(rect.height),
    ...(node.data.pinned === true ? { pinned: true } : {}),
  }
  switch (node.type) {
    case 'card':
      return {
        ...base,
        form: node.data.form,
        ...(node.data.icon ? { icon: node.data.icon } : {}),
        ...(node.data.badge ? { badge: node.data.badge } : {}),
        ...(node.data.status !== 'none' ? { status: node.data.status } : {}),
        ...(node.data.color !== 'neutral' ? { color: node.data.color } : {}),
        ...(full && node.data.lines.length > 0 ? { lines: node.data.lines.map((line) => line.text) } : {}),
        ...(full ? compactDetails(node.data.details) : {}),
      }
    case 'shape':
      return {
        ...base,
        shape: node.data.shape,
        ...(node.data.icon ? { icon: node.data.icon } : {}),
        ...(node.data.color !== 'neutral' ? { color: node.data.color } : {}),
        ...(full ? compactDetails(node.data.details) : {}),
      }
    case 'text':
      return base
    case 'group':
      return {
        ...base,
        ...(node.data.kind !== CUSTOM_BOUNDARY ? { boundary: node.data.kind } : {}),
        ...(node.data.detail ? { detail: node.data.detail } : {}),
        ...(node.data.color !== 'auto' ? { color: node.data.color } : {}),
        ...(full ? compactDetails(node.data.details) : {}),
      }
  }
}

function compactPayload(payload: Payload, full: boolean) {
  if (!full) return { fields: payload.fields.length }
  return {
    fields: payload.fields.map((field) => ({
      path: field.path,
      type: field.type,
      ...(field.required ? {} : { required: false }),
      ...(field.example ? { example: field.example } : {}),
      ...(field.description ? { description: field.description } : {}),
    })),
  }
}

function compactEdge(edge: DiagramEdge, full: boolean) {
  const data = edge.data
  return {
    id: edge.id,
    from: edge.source,
    to: edge.target,
    ...(data?.label ? { label: data.label } : {}),
    ...(data && edgeProtocol(data) ? { protocol: edgeProtocol(data) } : {}),
    ...(data && data.stroke !== 'solid' ? { style: data.stroke } : {}),
    ...(data?.traffic.enabled ? { traffic: true } : {}),
    ...(data?.markerStart === 'arrow' ? { bidirectional: true } : {}),
    ...(data?.request ? { request: compactPayload(data.request, full) } : {}),
    ...(data?.response ? { response: compactPayload(data.response, full) } : {}),
  }
}

function compactFlow(flow: Flow, full: boolean) {
  if (!full) return { id: flow.id, name: flow.name, steps: flow.steps.length }
  return {
    id: flow.id,
    name: flow.name,
    token: flow.token.label,
    spotlight: flow.spotlight,
    loop: flow.loop,
    bodies: flow.bodies,
    steps: flow.steps.map((step, index) => ({
      index,
      [step.target.kind]: step.target.id,
      ...(step.caption ? { caption: step.caption } : {}),
      ...(step.event ? { event: step.event } : {}),
      ...(step.latencyMs !== null ? { latencyMs: step.latencyMs } : {}),
      ...(step.level !== 'info' ? { level: step.level } : {}),
    })),
  }
}

/** Returns a short form of a diagram for an agent, with absolute canvas rectangles and without default values. */
export function compactDiagram(content: DiagramContent, detail: 'outline' | 'full' = 'outline') {
  const full = detail === 'full'
  const byId = new Map(content.nodes.map((node) => [node.id, node]))
  const warnings = layoutWarnings(content.nodes)
  const compact = {
    id: content.id,
    name: content.name,
    ...(full ? { theme: content.theme } : {}),
    nodes: content.nodes.map((node) => compactNode(node, absoluteRect(node, byId), full)),
    edges: content.edges.map((edge) => compactEdge(edge, full)),
    flows: content.flows.map((flow) => compactFlow(flow, full)),
  }
  return withWarnings(compact, warnings)
}
