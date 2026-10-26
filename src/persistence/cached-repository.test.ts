import { describe, expect, it, vi } from 'vitest'
import { createDiagram } from '@/model/defaults'
import type { Diagram } from '@/model/schema'
import { createCachedRepository, serializeDiagram } from './cached-repository'
import type { RepositoryEvent } from './repository'

function diagram(name: string, patch: Partial<Diagram> = {}): Diagram {
  return { ...createDiagram(name), ...patch }
}

function setup(files: { id: string; text: string }[] = []) {
  const sink = { write: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) }
  const repository = createCachedRepository({ location: { kind: 'folder', path: '/diagrams' }, files, sink })
  const events: RepositoryEvent[] = []
  repository.subscribe((event) => events.push(event))
  return { repository, sink, events }
}

describe('createCachedRepository', () => {
  it('lists files newest first and loads them under the file id', () => {
    const old = diagram('Old', { updatedAt: 1 })
    const recent = diagram('Recent', { updatedAt: 5 })
    const { repository } = setup([
      { id: 'old-file', text: serializeDiagram(old) },
      { id: 'recent-file', text: serializeDiagram(recent) },
    ])
    expect(repository.list().map((meta) => meta.id)).toEqual(['recent-file', 'old-file'])
    expect(repository.load('old-file')).toMatchObject({ id: 'old-file', name: 'Old' })
  })

  it('lists a broken file by its id and throws when it loads', () => {
    const { repository } = setup([{ id: 'broken', text: '{ nope' }])
    expect(repository.list()).toEqual([{ id: 'broken', name: 'broken', updatedAt: 0, nodeCount: 0, flowCount: 0 }])
    expect(() => repository.load('broken')).toThrow()
  })

  it('reads its own save at once, writes it through and reports the write', async () => {
    const { repository, sink, events } = setup()
    const saved = diagram('Saved', { rev: 3 })
    expect(repository.save(saved)).toEqual({ ok: true })
    expect(repository.load(saved.id)).toMatchObject({ name: 'Saved', rev: 3 })
    await repository.settled()
    expect(sink.write).toHaveBeenCalledWith({ id: saved.id, text: serializeDiagram(saved) })
    expect(events).toEqual([{ kind: 'saved', id: saved.id }])
  })

  it('reports a write that fails later', async () => {
    const { repository, sink, events } = setup()
    sink.write.mockRejectedValueOnce(new Error('disk full'))
    const saved = diagram('Saved')
    repository.save(saved)
    await repository.settled()
    expect(events).toEqual([{ kind: 'save-failed', id: saved.id, reason: 'unknown', message: 'disk full' }])
  })

  it('takes a file that changed outside, with its own rev, and reports it', () => {
    const original = diagram('Original', { rev: 4 })
    const { repository, events } = setup([{ id: 'a', text: serializeDiagram(original) }])
    repository.applyExternal({
      kind: 'changed',
      id: 'a',
      text: serializeDiagram({ ...original, name: 'Edited', rev: 2 }),
    })
    expect(repository.load('a')).toMatchObject({ name: 'Edited', rev: 2 })
    expect(events).toEqual([{ kind: 'changed', id: 'a' }])
  })

  it('ignores an outside change with the same text', () => {
    const original = diagram('Same')
    const text = serializeDiagram(original)
    const { repository, events } = setup([{ id: 'a', text }])
    repository.applyExternal({ kind: 'changed', id: 'a', text })
    expect(events).toEqual([])
  })

  it('drops a file that was removed outside', () => {
    const { repository, events } = setup([{ id: 'a', text: serializeDiagram(diagram('Gone')) }])
    repository.applyExternal({ kind: 'removed', id: 'a' })
    expect(repository.list()).toEqual([])
    expect(events).toEqual([{ kind: 'changed', id: 'a' }])
  })

  it('reports a remove when it reaches storage, and a remove that fails', async () => {
    const { repository, sink, events } = setup([{ id: 'a', text: serializeDiagram(diagram('A')) }])
    repository.remove('a')
    sink.remove.mockRejectedValueOnce(new Error('in use'))
    repository.remove('b')
    await repository.settled()
    expect(sink.remove).toHaveBeenCalledWith('a', true)
    expect(events).toEqual([
      { kind: 'removed', id: 'a' },
      { kind: 'remove-failed', id: 'b', message: 'in use' },
    ])
  })

  it('keeps list entries stable while their diagram does not change', () => {
    const { repository } = setup([
      { id: 'a', text: serializeDiagram(diagram('A')) },
      { id: 'b', text: serializeDiagram(diagram('B')) },
    ])
    const before = repository.list().find((meta) => meta.id === 'a')
    repository.save(diagram('C'))
    expect(repository.list().find((meta) => meta.id === 'a')).toBe(before)
  })
})
