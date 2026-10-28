import { describe, expect, it } from 'vitest'
import { nodeLabel } from '@/model/labels'
import { DIAGRAM_VERSION, type Diagram } from '@/model/schema'
import { TEMPLATES } from '@/templates'
import { decodeShareData, encodeShareData, LONG_LINK_CHARS, ShareLinkError, shareUrl } from './share-link'

const orderSystem = () => TEMPLATES.find((template) => template.id === 'order-system')!.build()

describe('share links', () => {
  it('carries the content of a diagram and gives it a new identity', async () => {
    const diagram = orderSystem()
    const data = await encodeShareData(diagram)
    expect(data).toMatch(/^z[\w-]+$/)
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

  it('keeps the link of a typical diagram short enough for chat apps, with the same graph', async () => {
    const diagram = orderSystem()
    const data = await encodeShareData(diagram)
    expect(shareUrl('https://draw.thias.dev/', data).length).toBeLessThan(LONG_LINK_CHARS / 2)
    const shared = await decodeShareData(data)
    const title = new Map(shared.nodes.map((node) => [node.id, 'title' in node.data ? node.data.title : node.type]))
    const original = new Map(diagram.nodes.map((node) => [node.id, 'title' in node.data ? node.data.title : node.type]))
    const ends = (edges: typeof diagram.edges, names: Map<string, string>) =>
      edges.map((edge) => `${names.get(edge.source)} -> ${names.get(edge.target)}`)
    expect(ends(shared.edges, title)).toEqual(ends(diagram.edges, original))
    expect(shared.nodes[0]!.id).toMatch(/^n_\w{1,3}$/)
  })

  it('leaves text that looks like an id as it is', async () => {
    const diagram = orderSystem()
    const card = diagram.nodes.find((node) => node.type === 'card')!
    if (card.type === 'card') card.data.title = 'n_4k2j9x0q7a'
    const shared = await decodeShareData(await encodeShareData(diagram))
    expect(shared.nodes.some((node) => node.type === 'card' && node.data.title === 'n_4k2j9x0q7a')).toBe(true)
  })

  it('explains a link that is cut off, not a diagram, or from a newer version', async () => {
    const data = await encodeShareData(orderSystem())
    await expect(decodeShareData(data.slice(0, 200))).rejects.toThrow('This link is not complete.')
    await expect(decodeShareData('hello')).rejects.toThrow(ShareLinkError)
    const newer = { ...orderSystem(), version: DIAGRAM_VERSION + 1 } as unknown as Diagram
    await expect(decodeShareData(await encodeShareData(newer))).rejects.toThrow(
      `format ${DIAGRAM_VERSION + 1} from a newer version of Diagrams`,
    )
  })
})
