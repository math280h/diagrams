import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_THEME, createFlow } from '@/model/defaults'
import type { Flow, FlowPath } from '@/model/schema'
import { PRESET_BY_ID } from '@/model/presets'
import { selectOnly } from '@/store/actions'
import { useDoc } from '@/store/doc-store'
import { resetHistory, undo } from '@/store/history'
import { setUi, useUi } from '@/store/ui-store'
import { createStep } from './record'
import { clickedSelection, deleteSelectedSteps, selectAllSteps } from './step-selection'

const ORDER = ['a', 'b', 'c', 'd', 'e']
const plain = { toggle: false, range: false }
const toggle = { toggle: true, range: false }
const range = { toggle: false, range: true }

describe('clickedSelection', () => {
  it('selects only the clicked step on a plain click', () => {
    expect(clickedSelection(['a', 'b'], 'd', ORDER, plain)).toEqual(['d'])
  })

  it('adds or removes the clicked step with Ctrl or Cmd', () => {
    expect(clickedSelection(['b'], 'd', ORDER, toggle)).toEqual(['b', 'd'])
    expect(clickedSelection(['b', 'd'], 'b', ORDER, toggle)).toEqual(['d'])
  })

  it('selects a range from the last selected step in either direction, and keeps that step as the anchor', () => {
    expect(clickedSelection(['b'], 'd', ORDER, range)).toEqual(['c', 'd', 'b'])
    expect(clickedSelection(['d'], 'b', ORDER, range)).toEqual(['b', 'c', 'd'])
    expect(clickedSelection(['c', 'd', 'b'], 'a', ORDER, range)).toEqual(['a', 'b'])
  })

  it('adds a range to the selection with Shift and Ctrl', () => {
    expect(clickedSelection(['a', 'c'], 'e', ORDER, { toggle: true, range: true })).toEqual(['a', 'd', 'e', 'c'])
  })

  it('selects only the clicked step when no anchor is in the list', () => {
    expect(clickedSelection([], 'c', ORDER, range)).toEqual(['c'])
    expect(clickedSelection(['gone'], 'c', ORDER, range)).toEqual(['c'])
  })
})

describe('selected steps', () => {
  let flow: Flow
  let path: FlowPath

  const ids = () => useDoc.getState().flows[0]!.steps.map((step) => step.id)
  const paths = () => useDoc.getState().flows[0]!.paths

  beforeEach(() => {
    const node = PRESET_BY_ID.get('service')!.create({ x: 0, y: 0 })
    const steps = Array.from({ length: 5 }, () => createStep({ kind: 'node', id: node.id }))
    path = {
      id: 'p',
      name: 'Path 1',
      fromStep: steps[2]!.id,
      steps: [createStep({ kind: 'node', id: node.id })],
      rejoinStep: null,
    }
    flow = { ...createFlow(), steps, paths: [path] }
    useDoc.setState({ name: 'Steps', theme: DEFAULT_THEME, nodes: [node], edges: [], flows: [flow] })
    resetHistory()
    setUi({ flowPanelOpen: true, activeFlowId: flow.id, activePathId: null, selectedStepIds: [] })
  })

  it('deletes every selected step in one undo step and clears the selection', () => {
    const [first, second, third] = flow.steps
    setUi({ selectedStepIds: [third!.id, second!.id] })
    expect(deleteSelectedSteps()).toBe(true)
    expect(ids()).toEqual([first!.id, flow.steps[3]!.id, flow.steps[4]!.id])
    expect(paths()?.[0]?.fromStep).toBe(first!.id)
    expect(useUi.getState().selectedStepIds).toEqual([])

    undo()
    expect(ids()).toEqual(flow.steps.map((step) => step.id))
  })

  it('deletes the main steps and the path steps that the log shows together', () => {
    setUi({ activePathId: path.id })
    selectAllSteps()
    expect(useUi.getState().selectedStepIds).toEqual([...flow.steps.slice(0, 3), ...path.steps].map((step) => step.id))
    deleteSelectedSteps()
    expect(ids()).toEqual([flow.steps[3]!.id, flow.steps[4]!.id])
    expect(paths()).toEqual([])
  })

  it('deletes nothing while a node is selected or the flow panel is closed', () => {
    setUi({ selectedStepIds: [flow.steps[0]!.id] })
    selectOnly([useDoc.getState().nodes[0]!.id])
    expect(deleteSelectedSteps()).toBe(false)
    selectOnly([])
    setUi({ flowPanelOpen: false })
    expect(deleteSelectedSteps()).toBe(false)
    expect(ids()).toHaveLength(5)
  })
})
