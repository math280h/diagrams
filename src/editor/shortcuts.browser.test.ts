import { ReactFlowProvider, useStoreApi, type FitViewOptions } from '@xyflow/react'
import { act, createElement, Fragment, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Engine } from '@/engine/engine'
import { DEFAULT_THEME } from '@/model/defaults'
import { PRESET_BY_ID } from '@/model/presets'
import type { DiagramNode } from '@/model/types'
import { selectOnly, setName } from '@/store/actions'
import { useDoc } from '@/store/doc-store'
import { resetHistory } from '@/store/history'
import { setUi, useUi } from '@/store/ui-store'
import { useVersions } from '@/store/versions'
import { bindInsertProjection } from './insert'
import { useEditorShortcuts } from './shortcuts'

// React warns about each act() call when this flag is not set.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47]

function card(x: number): DiagramNode {
  return PRESET_BY_ID.get('service')!.create({ x, y: 0 })
}

let fits: (FitViewOptions | undefined)[]

function FitRecorder() {
  const flow = useStoreApi()
  useEffect(
    () =>
      flow.subscribe((state, previous) => {
        if (state.fitViewQueued && state.fitViewOptions !== previous.fitViewOptions) fits.push(state.fitViewOptions)
      }),
    [flow],
  )
  return null
}

function Shortcuts({ engine }: { engine: Engine }) {
  useEditorShortcuts(engine)
  return null
}

function editor() {
  return createElement(
    ReactFlowProvider,
    null,
    createElement(
      Fragment,
      null,
      createElement(FitRecorder),
      createElement(Shortcuts, { engine: engine as unknown as Engine }),
    ),
  )
}

const toggle = vi.fn()
const engine = { playback: { timeline: null as object | null, toggle } }

let container: HTMLElement
let root: Root
let a: DiagramNode
let b: DiagramNode

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = window) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

function inBody<T extends HTMLElement>(element: T): T {
  container.append(element)
  return element
}

function clipboard(kind: 'copy' | 'cut' | 'paste', data = new DataTransfer(), target: EventTarget = document) {
  const event = new ClipboardEvent(kind, { clipboardData: data, bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return { event, data }
}

const position = (node: DiagramNode) => useDoc.getState().nodes.find((item) => item.id === node.id)!.position
const selectedCount = () => useDoc.getState().nodes.filter((node) => node.selected).length

beforeEach(() => {
  a = card(0)
  b = card(400)
  useDoc.setState({ name: 'Start', theme: DEFAULT_THEME, nodes: [a, b], edges: [], flows: [] })
  resetHistory()
  setUi({ commandOpen: false, shortcutsOpen: false, flowPanelOpen: false, recording: false, insert: null })
  useVersions.setState({ previewId: null })
  engine.playback.timeline = null
  toggle.mockClear()
  fits = []

  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root.render(editor()))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  bindInsertProjection(null)
  vi.restoreAllMocks()
})

describe('editor shortcuts', () => {
  it('undoes with Ctrl+Z and redoes with Ctrl+Shift+Z, Ctrl+Y or the Command key', () => {
    setName('Renamed')
    expect(press('z', { ctrlKey: true }).defaultPrevented).toBe(true)
    expect(useDoc.getState().name).toBe('Start')
    press('z', { ctrlKey: true, shiftKey: true })
    expect(useDoc.getState().name).toBe('Renamed')
    press('z', { metaKey: true })
    expect(useDoc.getState().name).toBe('Start')
    expect(press('y', { ctrlKey: true }).defaultPrevented).toBe(true)
    expect(useDoc.getState().name).toBe('Renamed')
  })

  it('duplicates, selects all, groups and ungroups with Ctrl', () => {
    selectOnly([a.id])
    press('d', { ctrlKey: true })
    expect(useDoc.getState().nodes).toHaveLength(3)

    press('a', { ctrlKey: true })
    expect(selectedCount()).toBe(3)

    press('g', { ctrlKey: true })
    const group = useDoc.getState().nodes.find((node) => node.type === 'group')
    expect(group?.selected).toBe(true)
    press('g', { ctrlKey: true, shiftKey: true })
    expect(useDoc.getState().nodes.some((node) => node.type === 'group')).toBe(false)
  })

  it('opens and closes the command menu with Ctrl+K', () => {
    press('k', { ctrlKey: true })
    expect(useUi.getState().commandOpen).toBe(true)
    press('k', { metaKey: true })
    expect(useUi.getState().commandOpen).toBe(false)
  })

  it('uses the physical key for letters on a layout without Latin letters', () => {
    setName('Renamed')
    press('я', { code: 'KeyZ', ctrlKey: true })
    expect(useDoc.getState().name).toBe('Start')
  })

  it('moves the selection by one pixel with an arrow key and by ten with Shift', () => {
    selectOnly([a.id])
    expect(press('ArrowRight').defaultPrevented).toBe(true)
    press('ArrowDown', { shiftKey: true })
    press('ArrowLeft')
    press('ArrowUp')
    expect(position(a)).toEqual({ x: 0, y: 9 })
    expect(position(b)).toEqual({ x: 400, y: 0 })
  })

  it('leaves arrow keys on a focused node to React Flow', () => {
    selectOnly([a.id])
    const node = inBody(document.createElement('div'))
    node.className = 'react-flow__node'
    const inner = document.createElement('span')
    node.append(inner)
    expect(press('ArrowRight', {}, inner).defaultPrevented).toBe(false)
    expect(position(a)).toEqual({ x: 0, y: 0 })
  })

  it('opens the insert menu at the centre with N, and not with a modifier', () => {
    bindInsertProjection((point) => ({ x: point.x / 2, y: point.y / 2 }))
    press('n', { altKey: true })
    press('n', { ctrlKey: true })
    expect(useUi.getState().insert).toBeNull()

    press('т', { code: 'KeyN' })
    const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    expect(useUi.getState().insert).toEqual({
      screen: { x: center.x - 140, y: center.y - 120 },
      flow: { x: center.x / 2, y: center.y / 2 },
    })
  })

  it('copies the diagram as a PNG image with Alt+Shift+C', { timeout: 60_000 }, async () => {
    let image: Promise<Blob> | null = null
    vi.spyOn(navigator.clipboard, 'write').mockImplementation(async ([item]) => {
      image = item!.getType('image/png')
      await image
    })
    const event = press('Ç', { code: 'KeyC', altKey: true, shiftKey: true })
    expect(event.defaultPrevented).toBe(true)
    expect(image).not.toBeNull()
    const blob = await image!
    expect(blob.type).toBe('image/png')
    expect([...new Uint8Array(await blob.slice(0, 4).arrayBuffer())]).toEqual(PNG_SIGNATURE)
  })

  it('opens the shortcut sheet with a question mark', () => {
    press('?', { shiftKey: true })
    expect(useUi.getState().shortcutsOpen).toBe(true)
  })

  it('plays and pauses the flow with Space only while the flow panel shows a flow', () => {
    press(' ', { code: 'Space' })
    engine.playback.timeline = {}
    press(' ', { code: 'Space' })
    expect(toggle).not.toHaveBeenCalled()

    setUi({ flowPanelOpen: true })
    expect(press(' ', { code: 'Space' }).defaultPrevented).toBe(true)
    expect(toggle).toHaveBeenCalledTimes(1)
  })

  it('fits the diagram to the screen with Shift+1 on any layout', () => {
    press('!', { code: 'Digit8', shiftKey: true })
    press('1', { code: 'Digit1', shiftKey: true })
    press('1', { code: 'Digit1' })
    expect(fits).toHaveLength(2)
    expect(fits[0]).toMatchObject({ padding: '48px', maxZoom: 1.1, duration: 400 })
  })

  it('stops recording with Escape', () => {
    press('Escape')
    setUi({ recording: true })
    press('Escape')
    expect(useUi.getState().recording).toBe(false)
  })

  it('ignores keys while the user types, or while a dialog or menu has the focus', () => {
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    const inDialog = document.createElement('button')
    dialog.append(inDialog)
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    const inMenu = document.createElement('div')
    menu.append(inMenu)
    container.append(dialog, menu)
    const targets = [
      inBody(document.createElement('input')),
      inBody(document.createElement('textarea')),
      inBody(document.createElement('select')),
      inBody(editable),
      inDialog,
      inMenu,
    ]
    selectOnly([a.id])
    for (const target of targets) {
      press('a', { ctrlKey: true }, target)
      press('ArrowRight', {}, target)
    }
    expect(selectedCount()).toBe(1)
    expect(position(a)).toEqual({ x: 0, y: 0 })
  })

  it('ignores a key that another handler took', () => {
    const button = inBody(document.createElement('button'))
    button.addEventListener('keydown', (event) => event.preventDefault())
    press('a', { ctrlKey: true }, button)
    expect(selectedCount()).toBe(0)
  })

  it('does nothing while a version preview covers the canvas', () => {
    selectOnly([a.id])
    useVersions.setState({ previewId: 'v1' })
    press('a', { ctrlKey: true })
    press('ArrowRight')
    const { data, event } = clipboard('copy')
    expect(selectedCount()).toBe(1)
    expect(position(a)).toEqual({ x: 0, y: 0 })
    expect(data.getData('text/plain')).toBe('')
    expect(event.defaultPrevented).toBe(false)
  })

  it('copies, cuts and pastes the selection through the clipboard events', () => {
    selectOnly([a.id])
    const copy = clipboard('copy')
    expect(copy.event.defaultPrevented).toBe(true)
    expect(JSON.parse(copy.data.getData('text/plain')).nodes[0].id).toBe(a.id)

    clipboard('cut')
    expect(useDoc.getState().nodes.map((node) => node.id)).toEqual([b.id])

    const pasted = clipboard('paste', copy.data)
    expect(pasted.event.defaultPrevented).toBe(true)
    expect(useDoc.getState().nodes).toHaveLength(2)
    expect(useDoc.getState().nodes[1]!.position).toEqual({ x: 32, y: 32 })
  })

  it('leaves the clipboard events of a text field to the browser', () => {
    selectOnly([a.id])
    const input = inBody(document.createElement('input'))
    const { data, event } = clipboard('copy', new DataTransfer(), input)
    expect(data.getData('text/plain')).toBe('')
    expect(event.defaultPrevented).toBe(false)
    clipboard('cut', new DataTransfer(), input)
    expect(useDoc.getState().nodes).toHaveLength(2)
  })

  it('stops listening when the editor unmounts', () => {
    act(() => root.unmount())
    root = createRoot(container)
    press('a', { ctrlKey: true })
    clipboard('copy')
    expect(selectedCount()).toBe(0)
  })
})
