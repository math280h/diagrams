import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { createEdge, defaultCardData, defaultGroupData, newId } from '@/model/defaults'
import { absolutePosition } from '@/model/graph'
import { PRESET_BY_ID } from '@/model/presets'
import { DIAGRAM_VERSION } from '@/model/schema'
import type { DiagramNode } from '@/model/types'
import { selectOnly } from '@/store/actions'
import { useDoc } from '@/store/doc-store'
import { resetHistory, undo } from '@/store/history'
import { copySelection, cutSelection, paste } from './clipboard'

function card(x: number, y: number, title = 'Service'): DiagramNode {
  const node = PRESET_BY_ID.get('service')!.create({ x, y })
  return { ...node, data: { ...defaultCardData(), title } } as DiagramNode
}

function group(x: number, y: number): DiagramNode {
  return {
    id: newId('n'),
    type: 'group',
    position: { x, y },
    width: 600,
    height: 400,
    zIndex: -1,
    data: defaultGroupData(),
  }
}

function clipboardEvent(text = '') {
  const data = new Map<string, string>([['text/plain', text]])
  const event = {
    clipboardData: {
      setData: (type: string, value: string) => data.set(type, value),
      getData: (type: string) => data.get(type) ?? '',
    },
    preventDefault: vi.fn(),
  }
  return {
    event: event as unknown as ClipboardEvent,
    text: () => data.get('text/plain') ?? '',
    preventDefault: event.preventDefault,
  }
}

function copied() {
  const clipboard = clipboardEvent()
  copySelection(clipboard.event)
  return clipboard.text()
}

function titles() {
  return useDoc.getState().nodes.map((node) => (node.type === 'card' ? node.data.title : node.type))
}

const selected = () => useDoc.getState().nodes.filter((node) => node.selected)

beforeEach(() => {
  useDoc.setState({ nodes: [], edges: [], flows: [] })
  resetHistory()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('copySelection', () => {
  it('copies nothing without a selection', () => {
    useDoc.setState({ nodes: [card(0, 0)] })
    const clipboard = clipboardEvent()
    expect(copySelection(clipboard.event)).toBe(false)
    expect(clipboard.text()).toBe('')
    expect(clipboard.preventDefault).not.toHaveBeenCalled()
  })

  it('puts the selected nodes and the edges between them on the clipboard with the format version', () => {
    const [a, b, c] = [card(0, 0, 'A'), card(300, 0, 'B'), card(600, 0, 'C')]
    useDoc.setState({ nodes: [a, b, c], edges: [createEdge(a.id, b.id), createEdge(b.id, c.id)] })
    selectOnly([a.id, b.id])
    const clipboard = clipboardEvent()
    expect(copySelection(clipboard.event)).toBe(true)
    expect(clipboard.preventDefault).toHaveBeenCalled()

    const payload = JSON.parse(clipboard.text())
    expect(payload).toMatchObject({ marker: 'diagrams/clipboard@1', version: DIAGRAM_VERSION })
    expect(payload.nodes.map((node: DiagramNode) => node.id)).toEqual([a.id, b.id])
    expect(payload.edges).toEqual([expect.objectContaining({ source: a.id, target: b.id })])
  })

  it('copies a child without its group at its canvas position', () => {
    const box = group(100, 100)
    const child = { ...card(40, 60), parentId: box.id }
    useDoc.setState({ nodes: [box, child] })
    selectOnly([child.id])
    const [node] = JSON.parse(copied()).nodes
    expect(node).toMatchObject({ id: child.id, position: { x: 140, y: 160 } })
    expect(node).not.toHaveProperty('parentId')
  })

  it('writes to the system clipboard without a clipboard event', () => {
    const writeText = vi.fn(async (_text: string) => undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const a = card(0, 0)
    useDoc.setState({ nodes: [a] })
    selectOnly([a.id])
    expect(copySelection()).toBe(true)
    expect(JSON.parse(writeText.mock.calls[0]![0]).nodes[0].id).toBe(a.id)
  })
})

describe('cutSelection', () => {
  it('copies the selection and removes it as an undo step', () => {
    const [a, b] = [card(0, 0, 'A'), card(300, 0, 'B')]
    useDoc.setState({ nodes: [a, b] })
    selectOnly([a.id])
    const clipboard = clipboardEvent()
    cutSelection(clipboard.event)
    expect(JSON.parse(clipboard.text()).nodes[0].id).toBe(a.id)
    expect(titles()).toEqual(['B'])
    undo()
    expect(titles()).toEqual(['A', 'B'])
  })

  it('removes nothing without a selection', () => {
    useDoc.setState({ nodes: [card(0, 0)] })
    cutSelection(clipboardEvent().event)
    expect(useDoc.getState().nodes).toHaveLength(1)
  })
})

describe('paste', () => {
  it('pastes copies with new ids next to the originals, and moves each next paste further', () => {
    const [a, b] = [card(0, 0, 'A'), card(300, 0, 'B')]
    useDoc.setState({ nodes: [a, b], edges: [createEdge(a.id, b.id)] })
    selectOnly([a.id, b.id])
    const text = copied()

    const first = clipboardEvent(text)
    expect(paste(first.event)).toBe(true)
    expect(first.preventDefault).toHaveBeenCalled()
    expect(selected().map((node) => node.position)).toEqual([
      { x: 32, y: 32 },
      { x: 332, y: 32 },
    ])
    expect(selected().some((node) => node.id === a.id || node.id === b.id)).toBe(false)
    const [copyA, copyB] = selected()
    expect(useDoc.getState().edges).toContainEqual(expect.objectContaining({ source: copyA!.id, target: copyB!.id }))

    paste(clipboardEvent(text).event)
    expect(selected().map((node) => node.position.x)).toEqual([64, 364])
    expect(useDoc.getState().nodes).toHaveLength(6)
  })

  it('starts the paste offset again after a new copy', () => {
    const a = card(0, 0)
    useDoc.setState({ nodes: [a] })
    selectOnly([a.id])
    paste(clipboardEvent(copied()).event)
    paste(clipboardEvent(copied()).event)
    expect(selected()[0]!.position).toEqual({ x: 64, y: 64 })
    paste(clipboardEvent(copied()).event)
    expect(selected()[0]!.position).toEqual({ x: 96, y: 96 })
  })

  it('puts the top-left corner of the pasted nodes at a given point, and keeps groups whole', () => {
    const box = group(100, 100)
    const child = { ...card(40, 60), parentId: box.id }
    const free = card(800, 50)
    useDoc.setState({ nodes: [box, child, free] })
    selectOnly([box.id, free.id])
    const text = copied()
    useDoc.setState({ nodes: [] })

    paste(clipboardEvent(text).event, { x: 1000, y: 2000 })
    const nodes = useDoc.getState().nodes
    const byId = new Map(nodes.map((node) => [node.id, node]))
    const boxCopy = nodes.find((node) => node.type === 'group')
    const childCopy = nodes.find((node) => node.parentId !== undefined)
    const freeCopy = nodes.find((node) => node.type === 'card' && node.parentId === undefined)
    expect(nodes).toHaveLength(3)
    expect(boxCopy!.position).toEqual({ x: 1000, y: 2050 })
    expect(childCopy!.parentId).toBe(boxCopy!.id)
    expect(absolutePosition(childCopy!, byId)).toEqual({ x: 1040, y: 2110 })
    expect(freeCopy!.position).toEqual({ x: 1700, y: 2000 })
  })

  it('pastes the last copy of this window when the event has no clipboard data', () => {
    const a = card(0, 0, 'A')
    useDoc.setState({ nodes: [a] })
    selectOnly([a.id])
    copied()
    expect(paste()).toBe(true)
    expect(titles()).toEqual(['A', 'A'])
  })

  it('tells how many nodes it pasted when there are more than one', () => {
    const message = vi.spyOn(toast, 'message')
    const [a, b] = [card(0, 0), card(300, 0)]
    useDoc.setState({ nodes: [a, b] })
    selectOnly([a.id])
    paste(clipboardEvent(copied()).event)
    expect(message).not.toHaveBeenCalled()
    selectOnly([a.id, b.id])
    paste(clipboardEvent(copied()).event)
    expect(message).toHaveBeenCalledWith('Pasted 2 nodes')
  })

  it('migrates nodes that an older version of the app copied', () => {
    const { color: _color, details: _details, ...olderData } = defaultCardData({ title: 'Legacy' })
    const older = {
      marker: 'diagrams/clipboard@1',
      nodes: [{ id: 'n_old', type: 'card', position: { x: 0, y: 0 }, data: olderData }],
      edges: [],
    }
    expect(paste(clipboardEvent(JSON.stringify(older)).event)).toBe(true)
    const [node] = useDoc.getState().nodes
    expect(node!.data).toMatchObject({ title: 'Legacy', color: 'neutral', details: { owner: '', links: [] } })
  })

  it('refuses nodes from a newer version of the app and says why', () => {
    const error = vi.spyOn(toast, 'error')
    const newer = clipboardEvent(
      JSON.stringify({ marker: 'diagrams/clipboard@1', version: DIAGRAM_VERSION + 1, nodes: [], edges: [] }),
    )
    expect(paste(newer.event)).toBe(true)
    expect(newer.preventDefault).toHaveBeenCalled()
    expect(error).toHaveBeenCalledWith(expect.stringContaining('from a newer version of Diagrams'))
    expect(useDoc.getState().nodes).toEqual([])
  })

  it('refuses copied nodes that are not valid', () => {
    const error = vi.spyOn(toast, 'error')
    const broken = clipboardEvent(
      JSON.stringify({ marker: 'diagrams/clipboard@1', version: DIAGRAM_VERSION, nodes: [{ id: 1 }], edges: [] }),
    )
    expect(paste(broken.event)).toBe(true)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('The copied nodes cannot be read'))
    expect(useDoc.getState().nodes).toEqual([])
  })

  it('pastes nothing when nothing was copied and the clipboard holds other text', async () => {
    vi.resetModules()
    const fresh = await import('./clipboard')
    const { useDoc: freshDoc } = await import('@/store/doc-store')
    for (const text of ['', 'https://example.com', '{"marker":"another app"}']) {
      const clipboard = clipboardEvent(text)
      expect(fresh.paste(clipboard.event)).toBe(false)
      expect(clipboard.preventDefault).not.toHaveBeenCalled()
    }
    expect(fresh.paste()).toBe(false)
    expect(freshDoc.getState().nodes).toEqual([])
  })
})
