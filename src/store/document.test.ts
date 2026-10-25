import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDiagram } from '@/model/defaults'
import type { Diagram } from '@/model/schema'
import { repository, setRepository } from '@/persistence/active-repository'
import { createCachedRepository } from '@/persistence/cached-repository'
import { deleteDiagram } from '@/persistence/library-actions'
import { memoryVersionStore, setVersionStore } from '@/persistence/version-store'
import { useDoc } from './doc-store'
import { closeDiagramSession, flushPendingSave, openDiagramId, openDiagramSession } from './document'

let saves = 0

function stored(name: string): Diagram {
  const diagram = createDiagram(name)
  repository().save(diagram)
  saves = 0
  return repository().load(diagram.id)!
}

beforeEach(() => {
  const folder = createCachedRepository({
    location: { kind: 'folder', path: '/test' },
    files: [],
    sink: { write: async () => undefined, remove: async () => undefined },
  })
  const save = folder.save.bind(folder)
  folder.save = (diagram) => {
    saves++
    return save(diagram)
  }
  setRepository(folder)
  setVersionStore(memoryVersionStore())
})

afterEach(() => {
  const id = openDiagramId()
  if (id) closeDiagramSession(id, false)
  setVersionStore(null)
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
})
