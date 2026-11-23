import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { createDiagram, createFlow } from '@/model/defaults'
import { closeDiagramSession, openDiagramId, openDiagramSession } from '@/store/document'
import { repository, setRepository } from './active-repository'
import { createCachedRepository, type RepositorySink } from './cached-repository'
import { versionsSettled } from '@/store/versions'
import { createBlankDiagram, deleteDiagram, discardUnusedBlankDiagrams, renameDiagram } from './library-actions'
import { TrashError } from './repository'
import { memoryVersionStore, setVersionStore, versionStore } from './version-store'

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

describe('deleteDiagram', () => {
  async function storedWithVersion(name: string) {
    const diagram = createDiagram(name)
    repository().save(diagram)
    const at = Date.now()
    const meta = { id: 'v1', diagramId: diagram.id, startedAt: at, at, author: 'you' as const, summary: 'First' }
    await versionStore().put(meta, diagram, [])
    return diagram
  }

  const versionsOf = async (id: string) => {
    await versionsSettled()
    return versionStore().list(id)
  }

  it('keeps the diagram and its versions when the trash fails', async () => {
    const diagram = await storedWithVersion('Shop')
    removeFile.mockRejectedValueOnce(new TrashError('No trash on this drive.'))
    expect(await deleteDiagram(diagram.id)).toEqual({ ok: false, reason: 'trash', message: 'No trash on this drive.' })
    expect(removeFile).toHaveBeenCalledWith(diagram.id, true)
    expect(storedIds()).toEqual([diagram.id])
    expect(await versionsOf(diagram.id)).toHaveLength(1)
  })

  it('keeps the versions when a permanent delete fails', async () => {
    const diagram = await storedWithVersion('Shop')
    removeFile.mockRejectedValueOnce(new Error('The file is in use.'))
    expect(await deleteDiagram(diagram.id, { trash: false })).toEqual({
      ok: false,
      reason: 'unknown',
      message: 'The file is in use.',
    })
    expect(storedIds()).toEqual([diagram.id])
    expect(await versionsOf(diagram.id)).toHaveLength(1)
  })

  it('deletes the versions after storage takes the delete', async () => {
    const diagram = await storedWithVersion('Shop')
    expect(await deleteDiagram(diagram.id, { trash: false })).toEqual({ ok: true })
    expect(removeFile).toHaveBeenCalledWith(diagram.id, false)
    expect(storedIds()).toEqual([])
    expect(await versionsOf(diagram.id)).toEqual([])
  })
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
