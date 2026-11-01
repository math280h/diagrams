import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDiagram } from '@/model/defaults'
import type { Diagram } from '@/model/schema'
import { repository, setRepository } from '@/persistence/active-repository'
import { createCachedRepository } from '@/persistence/cached-repository'
import { deleteDiagram } from '@/persistence/library-actions'
import { memoryVersionStore, setVersionStore } from '@/persistence/version-store'
import { useDoc } from './doc-store'
import { useHistory } from './history'
import {
  closeDiagramSession,
  currentDiagram,
  flushPendingSave,
  openDiagramId,
  openDiagramSession,
  whenDiagramReady,
} from './document'

let saves = 0
let refuseSaves = false

function stored(name: string): Diagram {
  const diagram = createDiagram(name)
  repository().save(diagram)
  saves = 0
  return repository().load(diagram.id)!
}

function folderRepository() {
  return repository() as ReturnType<typeof createCachedRepository>
}

beforeEach(() => {
  refuseSaves = false
  const folder = createCachedRepository({
    location: { kind: 'folder', path: '/test' },
    files: [],
    sink: { write: async () => undefined, remove: async () => undefined },
  })
  const save = folder.save.bind(folder)
  folder.save = (diagram) => {
    saves++
    if (refuseSaves) return { ok: false, reason: 'quota', message: 'The storage is full.' }
    return save(diagram)
  }
  setRepository(folder)
  setVersionStore(memoryVersionStore())
})

afterEach(() => {
  const id = openDiagramId()
  if (id) closeDiagramSession(id, false)
  setVersionStore(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('diagram session', () => {
  it('saves a change after the delay, or at once on flush', () => {
    vi.useFakeTimers()
    try {
      const diagram = stored('Shop')
      openDiagramSession(diagram)
      useDoc.setState({ name: 'Store' })
      expect(saves).toBe(0)
      vi.advanceTimersByTime(400)
      expect(repository().load(diagram.id)?.name).toBe('Store')
      useDoc.setState({ name: 'Market' })
      flushPendingSave()
      expect(repository().load(diagram.id)?.name).toBe('Market')
    } finally {
      vi.useRealTimers()
    }
  })

  it('writes nothing when only the selection changed', () => {
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    useDoc.setState({ nodes: [...useDoc.getState().nodes] })
    flushPendingSave()
    expect(saves).toBe(0)
  })

  it('drops the waiting save of a diagram that is deleted, also when its editor closes after', () => {
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    useDoc.setState({ name: 'A change that waits for a save' })
    deleteDiagram(diagram.id)
    closeDiagramSession(diagram.id)
    expect(repository().load(diagram.id)).toBeNull()
    expect(openDiagramId()).toBeNull()
  })

  it('saves a diagram with the id of a deleted one after it opens again', () => {
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    deleteDiagram(diagram.id)
    repository().save(diagram)
    openDiagramSession(repository().load(diagram.id)!)
    useDoc.setState({ name: 'Back from the trash' })
    flushPendingSave()
    expect(repository().load(diagram.id)?.name).toBe('Back from the trash')
  })
})

describe('changes from outside the editor', () => {
  it('offers the newer version of a diagram that changed, and says when its file is gone', async () => {
    const { toast } = await import('sonner')
    const warning = vi.spyOn(toast, 'warning')
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    const folder = repository() as ReturnType<typeof createCachedRepository>

    folder.applyExternal({ kind: 'changed', id: diagram.id, text: JSON.stringify({ ...diagram, name: 'Edited' }) })
    expect(warning).toHaveBeenLastCalledWith(
      'This diagram changed on disk.',
      expect.objectContaining({ action: expect.anything() }),
    )

    folder.applyExternal({ kind: 'removed', id: diagram.id })
    expect(warning).toHaveBeenLastCalledWith(
      'The file of this diagram was deleted or moved.',
      expect.not.objectContaining({ action: expect.anything() }),
    )
    warning.mockRestore()
  })

  async function loadNewerAction() {
    const { toast } = await import('sonner')
    const warning = vi.spyOn(toast, 'warning')
    return () => {
      const options = warning.mock.lastCall?.[1] as unknown as { action: { onClick: () => void } }
      options.action.onClick()
    }
  }

  it('loads the newer version on request and takes it as the saved state', async () => {
    const clickLoadNewer = await loadNewerAction()
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    useDoc.setState({ name: 'Edit that waits' })
    folderRepository().applyExternal({
      kind: 'changed',
      id: diagram.id,
      text: JSON.stringify({ ...diagram, name: 'Edited outside', rev: 7 }),
    })
    clickLoadNewer()
    expect(useDoc.getState()).toMatchObject({ name: 'Edited outside', rev: 7 })
    expect(useHistory.getState().canUndo).toBe(false)
    flushPendingSave()
    expect(saves).toBe(0)

    useDoc.setState({ name: 'Edited here' })
    flushPendingSave()
    expect(repository().load(diagram.id)).toMatchObject({ name: 'Edited here', rev: 8 })
  })

  it('says when the newer version cannot be read, and keeps the open version', async () => {
    const { toast } = await import('sonner')
    const error = vi.spyOn(toast, 'error')
    const clickLoadNewer = await loadNewerAction()
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    folderRepository().applyExternal({ kind: 'changed', id: diagram.id, text: '{ broken' })
    clickLoadNewer()
    expect(error).toHaveBeenCalledWith('The newer version cannot be read.', expect.anything())
    expect(useDoc.getState().name).toBe('Shop')
  })

  it('ignores changes of other diagrams', async () => {
    const { toast } = await import('sonner')
    const warning = vi.spyOn(toast, 'warning')
    const open = stored('Open')
    const other = stored('Other')
    openDiagramSession(open)
    folderRepository().applyExternal({ kind: 'changed', id: other.id, text: JSON.stringify({ ...other, name: 'B' }) })
    expect(warning).not.toHaveBeenCalled()
  })
})

describe('saves of the open diagram', () => {
  it('saves under the next rev', () => {
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    useDoc.setState({ name: 'Store' })
    flushPendingSave()
    expect(useDoc.getState().rev).toBe(diagram.rev + 1)
    expect(repository().load(diagram.id)?.rev).toBe(diagram.rev + 1)
  })

  it('keeps the rev of the last save when the storage refuses a save', () => {
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    refuseSaves = true
    useDoc.setState({ name: 'Store' })
    flushPendingSave()
    expect(saves).toBe(1)
    expect(useDoc.getState().rev).toBe(diagram.rev)
    expect(repository().load(diagram.id)?.name).toBe('Shop')
  })

  it('saves a change that waits when the page hides', () => {
    const page = Object.assign(new EventTarget(), { visibilityState: 'visible' })
    const view = new EventTarget()
    vi.stubGlobal('document', page)
    vi.stubGlobal('window', view)
    const diagram = stored('Shop')
    openDiagramSession(diagram)

    useDoc.setState({ name: 'Store' })
    page.dispatchEvent(new Event('visibilitychange'))
    expect(saves).toBe(0)
    page.visibilityState = 'hidden'
    page.dispatchEvent(new Event('visibilitychange'))
    expect(repository().load(diagram.id)?.name).toBe('Store')

    useDoc.setState({ name: 'Market' })
    view.dispatchEvent(new Event('pagehide'))
    expect(repository().load(diagram.id)?.name).toBe('Market')

    closeDiagramSession(diagram.id)
    useDoc.setState({ id: diagram.id, name: 'After the editor closed' })
    view.dispatchEvent(new Event('pagehide'))
    expect(repository().load(diagram.id)?.name).toBe('Market')
  })

  it('saves nothing for a diagram that is not the open one', () => {
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    useDoc.setState({ name: 'Store' })
    useDoc.setState({ id: 'd_other' })
    flushPendingSave()
    expect(saves).toBe(0)
  })

  it('keeps the session when another diagram closes', () => {
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    closeDiagramSession('d_other')
    expect(openDiagramId()).toBe(diagram.id)
  })

  it('returns the open diagram in the stored form', () => {
    const diagram = stored('Shop')
    openDiagramSession(diagram)
    expect(currentDiagram()).toMatchObject({ id: diagram.id, name: 'Shop', version: diagram.version })
  })
})

describe('whenDiagramReady', () => {
  it('fails when no editor loads the diagram in time', async () => {
    vi.useFakeTimers()
    try {
      const waiting = expect(whenDiagramReady('d_never', 1000)).rejects.toThrow(
        'The diagram d_never did not open within 1000 ms.',
      )
      await vi.advanceTimersByTimeAsync(1000)
      await waiting
    } finally {
      vi.useRealTimers()
    }
  })
})
