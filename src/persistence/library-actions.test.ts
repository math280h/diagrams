import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { createDiagram, createFlow } from '@/model/defaults'
import { closeDiagramSession, openDiagramId, openDiagramSession } from '@/store/document'
import { repository, setRepository } from './active-repository'
import { createCachedRepository, type RepositorySink } from './cached-repository'
import { createBlankDiagram, discardUnusedBlankDiagrams, renameDiagram } from './library-actions'
import { memoryVersionStore, setVersionStore } from './version-store'

let removeFile: Mock<RepositorySink['remove']>

const storedIds = () =>
  repository()
    .list()
    .map((meta) => meta.id)

beforeEach(() => {
  removeFile = vi.fn(async () => undefined)
  setRepository(
    createCachedRepository({
      location: { kind: 'folder', path: '/test' },
      files: [],
      sink: { write: async () => undefined, remove: removeFile },
    }),
  )
  setVersionStore(memoryVersionStore())
})

afterEach(() => {
  const id = openDiagramId()
  if (id) closeDiagramSession(id, false)
  setVersionStore(null)
})

describe('discardUnusedBlankDiagrams', () => {
  it('deletes a new diagram that stays empty, and its file does not go to the trash', () => {
    const { diagram } = createBlankDiagram()
    discardUnusedBlankDiagrams()
    expect(storedIds()).toEqual([])
    expect(removeFile).toHaveBeenCalledWith(diagram.id, false)
  })

  it('keeps a new diagram while the editor shows it', () => {
    const { diagram } = createBlankDiagram()
    openDiagramSession(diagram)
    discardUnusedBlankDiagrams()
    expect(storedIds()).toEqual([diagram.id])
    closeDiagramSession(diagram.id)
    discardUnusedBlankDiagrams()
    expect(storedIds()).toEqual([])
  })

  it('keeps a new diagram that has a flow or another name, also after it becomes empty again', () => {
    const withFlow = createBlankDiagram().diagram
    repository().save({ ...withFlow, flows: [createFlow()] })
    const renamed = createBlankDiagram().diagram
    renameDiagram(renamed.id, 'Kept for later')
    discardUnusedBlankDiagrams()
    expect(storedIds().toSorted()).toEqual([withFlow.id, renamed.id].toSorted())

    repository().save(withFlow)
    discardUnusedBlankDiagrams()
    expect(storedIds()).toContain(withFlow.id)
  })

  it('keeps an empty diagram that did not come from a new diagram', () => {
    const diagram = createDiagram()
    repository().save(diagram)
    discardUnusedBlankDiagrams()
    expect(storedIds()).toEqual([diagram.id])
  })
})
