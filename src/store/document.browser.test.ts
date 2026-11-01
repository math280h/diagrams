import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDiagram } from '@/model/defaults'
import { repository, setRepository } from '@/persistence/active-repository'
import { createCachedRepository, serializeDiagram } from '@/persistence/cached-repository'
import { memoryVersionStore, setVersionStore } from '@/persistence/version-store'
import { useDoc } from './doc-store'
import { flushPendingSave, openDiagramId, useDiagramDocument, whenDiagramReady, type LoadStatus } from './document'

// React writes a warning for each act() call if IS_REACT_ACT_ENVIRONMENT is not true.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLElement
let root: Root
const statuses: LoadStatus[] = []

function Editor({ id }: { id: string }) {
  statuses.push(useDiagramDocument(id))
  return null
}

const shown = () => statuses.at(-1)

function render(id: string) {
  act(() => root.render(createElement(Editor, { id })))
}

function folder(files: { id: string; text: string }[]) {
  setRepository(
    createCachedRepository({
      location: { kind: 'folder', path: '/test' },
      files,
      sink: { write: async () => undefined, remove: async () => undefined },
    }),
  )
}

beforeEach(() => {
  statuses.length = 0
  setVersionStore(memoryVersionStore())
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  setVersionStore(null)
})

describe('useDiagramDocument', () => {
  it('opens a stored diagram, saves its changes and closes it on unmount', async () => {
    const diagram = createDiagram('Shop')
    folder([{ id: diagram.id, text: serializeDiagram(diagram) }])
    render(diagram.id)
    expect(shown()).toEqual({ kind: 'ready' })
    expect(useDoc.getState()).toMatchObject({ id: diagram.id, name: 'Shop' })
    expect(openDiagramId()).toBe(diagram.id)
    await expect(whenDiagramReady(diagram.id)).resolves.toEqual({ kind: 'ready' })

    useDoc.setState({ name: 'Store' })
    flushPendingSave()
    expect(repository().load(diagram.id)?.name).toBe('Store')

    useDoc.setState({ name: 'Saved on close' })
    act(() => root.unmount())
    root = createRoot(container)
    expect(openDiagramId()).toBeNull()
    expect(repository().load(diagram.id)?.name).toBe('Saved on close')
  })

  it('saves a waiting change when the page hides', () => {
    const diagram = createDiagram('Shop')
    folder([{ id: diagram.id, text: serializeDiagram(diagram) }])
    render(diagram.id)
    useDoc.setState({ name: 'Before the tab closed' })
    window.dispatchEvent(new PageTransitionEvent('pagehide'))
    expect(repository().load(diagram.id)?.name).toBe('Before the tab closed')
  })

  it('reports a diagram that is not in storage', async () => {
    folder([])
    render('d_missing')
    expect(shown()).toEqual({ kind: 'missing' })
    expect(openDiagramId()).toBeNull()
    await expect(whenDiagramReady('d_missing')).resolves.toEqual({ kind: 'missing' })
  })

  it('reports a diagram that cannot be read, with the reason', () => {
    folder([{ id: 'd_broken', text: '{ broken' }])
    render('d_broken')
    expect(shown()).toMatchObject({ kind: 'invalid', message: expect.any(String) })
    expect(openDiagramId()).toBeNull()
  })

  it('lets a caller wait until the editor has loaded the diagram', async () => {
    const diagram = createDiagram('Later')
    folder([{ id: diagram.id, text: serializeDiagram(diagram) }])
    const ready = whenDiagramReady(diagram.id)
    render(diagram.id)
    await expect(ready).resolves.toEqual({ kind: 'ready' })
  })

  it('shows the loading state for another diagram until that diagram opens', () => {
    const first = createDiagram('First')
    const second = createDiagram('Second')
    folder([
      { id: first.id, text: serializeDiagram(first) },
      { id: second.id, text: serializeDiagram(second) },
    ])
    render(first.id)
    statuses.length = 0
    render(second.id)
    expect(statuses[0]).toEqual({ kind: 'loading' })
    expect(statuses.at(-1)).toEqual({ kind: 'ready' })
    expect(openDiagramId()).toBe(second.id)
    expect(useDoc.getState().name).toBe('Second')
  })
})
