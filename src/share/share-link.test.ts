import { describe, expect, it } from 'vitest'
import { nodeLabel } from '@/model/labels'
import { DIAGRAM_VERSION, type Diagram } from '@/model/schema'
import { TEMPLATES } from '@/templates'
import {
  decodeShareData,
  encodeShareData,
  LONG_LINK_CHARS,
  MAX_LINK_JSON_BYTES,
  ShareLinkError,
  shareUrl,
} from './share-link'
import yDiagram from './samples/y-checkout-flow.json'
import yLink from './samples/y-checkout-flow.txt?raw'
import zLink from './samples/z-checkout-flow.txt?raw'

const TEXT_KEYS = new Set(['title', 'label', 'caption', 'detail', 'name', 'event', 'description'])
const SLOW = { timeout: 60_000 }

/** Returns a template with text of its own, so that the link dictionary does not hold it, as for a user's diagram. */
function ownDiagram(templateId: string): Diagram {
  const template = TEMPLATES.find((candidate) => candidate.id === templateId)!.build()
  let n = 0
  return JSON.parse(JSON.stringify(template), (key, value: unknown) =>
    typeof value === 'string' && value && TEXT_KEYS.has(key)
      ? `Own ${(n++).toString(36)} ${value.toUpperCase()}`
      : value,
  ) as Diagram
}

describe('share links', () => {
  it('carries the content of a diagram and gives it a new identity', SLOW, async () => {
    const diagram = ownDiagram('order-system')
    const data = await encodeShareData(diagram)
    expect(data).toMatch(/^y[\w-]+x$/)
    const shared = await decodeShareData(data)
    expect(shared.id).not.toBe(diagram.id)
    expect(shared).toMatchObject({ name: diagram.name, theme: diagram.theme })
    expect(shared.nodes.map((node) => [node.type, nodeLabel(node), node.position])).toEqual(
      diagram.nodes.map((node) => [node.type, nodeLabel(node), node.position]),
    )
    const ids = new Set([...shared.nodes, ...shared.edges].map((element) => element.id))
    for (const step of shared.flows.flatMap((flow) => flow.steps)) expect(ids.has(step.target.id)).toBe(true)
    expect(shared.flows.map((flow) => [flow.name, flow.steps.length])).toEqual(
      diagram.flows.map((flow) => [flow.name, flow.steps.length]),
    )
  })

  it('keeps the link of a typical diagram short enough for chat apps, with the same graph', SLOW, async () => {
    const diagram = ownDiagram('order-system')
    const data = await encodeShareData(diagram)
    expect(shareUrl('https://draw.thias.dev/', data).length).toBeLessThan(LONG_LINK_CHARS / 8)
    const shared = await decodeShareData(data)
    const title = new Map(shared.nodes.map((node) => [node.id, 'title' in node.data ? node.data.title : node.type]))
    const original = new Map(diagram.nodes.map((node) => [node.id, 'title' in node.data ? node.data.title : node.type]))
    const ends = (edges: typeof diagram.edges, names: Map<string, string>) =>
      edges.map((edge) => `${names.get(edge.source)} -> ${names.get(edge.target)}`)
    expect(ends(shared.edges, title)).toEqual(ends(diagram.edges, original))
    expect(shared.nodes[0]!.id).toMatch(/^n_\w{1,3}$/)
  })

  it('keeps alternate paths of a flow', SLOW, async () => {
    const diagram = ownDiagram('event-pipeline')
    const shared = await decodeShareData(await encodeShareData(diagram))
    const flow = shared.flows[0]!
    expect(flow.paths ?? []).toHaveLength(diagram.flows[0]!.paths?.length ?? 0)
    expect(flow.steps.map((step) => step.id)).toContain(flow.paths?.[0]?.fromStep)
  })

  it('leaves text that looks like an id as it is', SLOW, async () => {
    const diagram = ownDiagram('order-system')
    const card = diagram.nodes.find((node) => node.type === 'card')!
    if (card.type === 'card') card.data.title = 'n_4k2j9x0q7a'
    const shared = await decodeShareData(await encodeShareData(diagram))
    expect(shared.nodes.some((node) => node.type === 'card' && node.data.title === 'n_4k2j9x0q7a')).toBe(true)
  })

  it('explains a link that is cut off, damaged, not a diagram, or from a newer version', SLOW, async () => {
    const data = await encodeShareData(ownDiagram('order-system'))
    const middle = Math.floor(data.length / 2)
    const damaged = data.slice(0, middle) + (data[middle] === 'A' ? 'B' : 'A') + data.slice(middle + 1)
    for (const broken of [data.slice(0, -1), data.slice(0, middle), `${data.slice(0, middle)}x`, damaged]) {
      await expect(decodeShareData(broken)).rejects.toThrow('This link is not complete.')
    }
    await expect(decodeShareData('hello')).rejects.toThrow(ShareLinkError)
    const newer = { ...ownDiagram('order-system'), version: DIAGRAM_VERSION + 1 } as unknown as Diagram
    await expect(decodeShareData(await encodeShareData(newer))).rejects.toThrow(
      `format ${DIAGRAM_VERSION + 1} from a newer version of Diagrams`,
    )
  })

  it('refuses a diagram that is too large for a link', async () => {
    const diagram = ownDiagram('checkout-flow')
    diagram.name = 'x'.repeat(MAX_LINK_JSON_BYTES)
    await expect(encodeShareData(diagram)).rejects.toThrow('too large for a link')
  })

  it('opens links in the earlier format', async () => {
    const shared = await decodeShareData(zLink.trim())
    expect(shared.name).toBe('Checkout flow')
    expect([shared.nodes.length, shared.edges.length, shared.flows.length]).toEqual([7, 7, 1])
  })

  it('codes a diagram exactly as every earlier version did, and opens that link', SLOW, async () => {
    const diagram = yDiagram as unknown as Diagram
    expect(await encodeShareData(diagram)).toBe(yLink.trim())
    const shared = await decodeShareData(yLink.trim())
    expect(shared.name).toBe(diagram.name)
    expect(shared.nodes.map(nodeLabel)).toEqual(diagram.nodes.map(nodeLabel))
  })
})
