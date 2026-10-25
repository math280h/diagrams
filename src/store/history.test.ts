import { beforeEach, describe, expect, it } from 'vitest'
import { createEdge } from '@/model/defaults'
import { PRESET_BY_ID } from '@/model/presets'
import type { DiagramNode } from '@/model/types'
import { addNodes, onNodesChange, setName, updateNodeData } from './actions'
import { useDoc } from './doc-store'
import { beginGesture, endGesture, oneStep, redo, resetHistory, undo, useHistory } from './history'

function card(x = 0): DiagramNode {
  return PRESET_BY_ID.get('service')!.create({ x, y: 0 })
}

beforeEach(() => {
  useDoc.setState({ nodes: [], edges: [], flows: [], name: 'Start' })
  resetHistory()
})

describe('history', () => {
  it('undoes and redoes an added node', () => {
    addNodes([card()])
    expect(useDoc.getState().nodes).toHaveLength(1)
    undo()
    expect(useDoc.getState().nodes).toHaveLength(0)
    redo()
    expect(useDoc.getState().nodes).toHaveLength(1)
  })

  it('merges fast edits with the same key into one step', () => {
    const node = card()
    addNodes([node])
    updateNodeData(node.id, { title: 'A' }, 'title')
    updateNodeData(node.id, { title: 'AB' }, 'title')
    updateNodeData(node.id, { title: 'ABC' }, 'title')
    undo()
    const restored = useDoc.getState().nodes[0]!
    expect(restored.type === 'card' && restored.data.title).toBe('Service')
  })

  it('records a drag as one step and ignores a drag without movement', () => {
    const node = card()
    addNodes([node])
    beginGesture()
    onNodesChange([{ type: 'position', id: node.id, position: { x: 10, y: 0 }, dragging: true }])
    onNodesChange([{ type: 'position', id: node.id, position: { x: 50, y: 0 }, dragging: true }])
    endGesture()
    expect(useDoc.getState().nodes[0]!.position.x).toBe(50)
    undo()
    expect(useDoc.getState().nodes[0]!.position.x).toBe(0)

    resetHistory()
    beginGesture()
    endGesture()
    expect(useHistory.getState().canUndo).toBe(false)
  })

  it('does not record selection changes', () => {
    const node = card()
    addNodes([node], [], false)
    resetHistory()
    onNodesChange([{ type: 'select', id: node.id, selected: true }])
    expect(useHistory.getState().canUndo).toBe(false)
  })

  it('removes the selection flags when it restores a snapshot', () => {
    const first = card()
    const second = card(300)
    addNodes([first, second])
    useDoc.setState({ edges: [createEdge(first.id, second.id)] })
    setName('Renamed')
    undo()
    expect(useDoc.getState().name).toBe('Start')
    expect(useDoc.getState().nodes.every((node) => !node.selected)).toBe(true)
  })
})

describe('oneStep', () => {
  it('makes one undo step from several actions', () => {
    oneStep(() => {
      addNodes([card(0)])
      addNodes([card(300)])
      setName('Two cards')
    })
    expect(useDoc.getState().nodes).toHaveLength(2)
    undo()
    expect(useDoc.getState().nodes).toHaveLength(0)
    expect(useDoc.getState().name).toBe('Start')
    expect(useHistory.getState().canUndo).toBe(false)
  })

  it('records no step when nothing changes', () => {
    oneStep(() => undefined)
    expect(useHistory.getState().canUndo).toBe(false)
  })

  it('restores the document when the change throws', () => {
    addNodes([card()])
    expect(() =>
      oneStep(() => {
        setName('Half done')
        throw new Error('stop')
      }),
    ).toThrow('stop')
    expect(useDoc.getState().name).toBe('Start')
    undo()
    expect(useDoc.getState().nodes).toHaveLength(0)
  })
})
