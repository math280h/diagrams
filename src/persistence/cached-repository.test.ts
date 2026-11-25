import { describe, expect, it, vi } from 'vitest'
import { createDiagram, createFlow } from '@/model/defaults'
import type { Diagram } from '@/model/schema'
import { createCachedRepository, serializeDiagram } from './cached-repository'
import { TrashError, type RepositoryEvent, type StorageLocation } from './repository'
import { DIAGRAM_SCHEMA_URL } from './schema-address'

function diagram(name: string, patch: Partial<Diagram> = {}): Diagram {
  return { ...createDiagram(name), ...patch }
}

function setup(
  files: { id: string; text: string; path?: string }[] = [],
  location: StorageLocation = { kind: 'folder', path: '/diagrams' },
) {
  const sink = { write: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) }
  const repository = createCachedRepository({ location, files, sink })
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
      { kind: 'remove-failed', id: 'b', reason: 'unknown', message: 'in use' },
    ])
  })

  it('keeps a diagram whose remove fails, and tells a failed trash from other failures', async () => {
    const kept = diagram('Kept')
    const { repository, sink, events } = setup([{ id: 'a', text: serializeDiagram(kept) }])
    sink.remove.mockRejectedValueOnce(new TrashError('No trash on this drive.'))
    repository.remove('a')
    expect(repository.list()).toEqual([])
    await repository.settled()
    expect(events).toEqual([{ kind: 'remove-failed', id: 'a', reason: 'trash', message: 'No trash on this drive.' }])
    expect(repository.list().map((meta) => meta.name)).toEqual(['Kept'])
    expect(repository.load('a')?.name).toBe('Kept')
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

  it('writes numbers to two decimals', () => {
    const text = serializeDiagram(diagram('Round', { viewport: { x: 12.345678, y: -0.004, zoom: 0.8333333 } }))
    expect(JSON.parse(text).viewport).toEqual({ x: 12.35, y: 0, zoom: 0.83 })
  })

  it('does not write a linked file again when only the view, the save counter or the sizes change', async () => {
    const first = diagram('Linked', { id: 'link-1' })
    const { repository, sink, events } = setup([
      { id: 'link-1', text: serializeDiagram(first), path: '/repo/docs/a.diagram.json' },
    ])
    repository.save({
      ...first,
      viewport: { x: 40, y: 10, zoom: 1.5 },
      rev: first.rev + 1,
      updatedAt: first.updatedAt + 1,
    })
    await repository.settled()
    expect(sink.write).not.toHaveBeenCalled()
    expect(events).toContainEqual({ kind: 'saved', id: 'link-1' })
    expect(repository.list()[0]).toMatchObject({ path: '/repo/docs/a.diagram.json' })

    repository.save({ ...first, name: 'Renamed' })
    await repository.settled()
    expect(sink.write).toHaveBeenCalledTimes(1)
  })

  it('does not write a file of a picked folder again when only the view, the save counter or the sizes change', async () => {
    const first = diagram('Project', { id: 'd_project' })
    const { repository, sink } = setup([{ id: 'd_project', text: serializeDiagram(first) }], {
      kind: 'picked-folder',
      name: 'docs',
    })
    repository.save({ ...first, viewport: { x: 5, y: 5, zoom: 2 }, rev: first.rev + 1 })
    await repository.settled()
    expect(sink.write).not.toHaveBeenCalled()
    repository.save({ ...first, name: 'Renamed' })
    await repository.settled()
    expect(sink.write).toHaveBeenCalledTimes(1)
  })

  it('does not write a linked file without a schema address again only to add the address', async () => {
    const first = diagram('Hand-written', { id: 'link-2' })
    const { repository, sink } = setup([
      { id: 'link-2', text: JSON.stringify(first), path: '/repo/docs/b.diagram.json' },
    ])
    repository.save({ ...first, viewport: { x: 5, y: 5, zoom: 2 }, rev: first.rev + 1 })
    await repository.settled()
    expect(sink.write).not.toHaveBeenCalled()
    repository.save({ ...first, name: 'Renamed' })
    await repository.settled()
    expect(sink.write).toHaveBeenCalledWith({
      id: 'link-2',
      text: expect.stringContaining(
        `{\n  "$schema": "${DIAGRAM_SCHEMA_URL}",\n  "id": "link-2",\n  "name": "Renamed",`,
      ),
    })
  })

  it('does not write a file of a picked folder again when only the order of its keys changes', async () => {
    const flow = createFlow('Place an order')
    const stepBuilt = { target: { kind: 'node' as const, id: 'n_1' }, caption: 'Pay', id: 's_1' }
    const first = diagram('Order system', {
      id: 'd_order',
      flows: [{ ...flow, steps: [stepBuilt] }] as Diagram['flows'],
    })
    const { repository, sink } = setup([{ id: 'd_order', text: serializeDiagram(first) }], {
      kind: 'picked-folder',
      name: 'docs',
    })
    const stepParsed = { id: 's_1', target: { id: 'n_1', kind: 'node' as const }, caption: 'Pay' }
    const parsedFlows = [{ ...flow, steps: [stepParsed] }] as Diagram['flows']
    repository.save({ ...first, rev: first.rev + 1, flows: parsedFlows })
    await repository.settled()
    expect(sink.write).not.toHaveBeenCalled()
  })

  it('writes a linked file again after its write failed, also when the next save changes only the view', async () => {
    const first = diagram('Linked', { id: 'link-1' })
    const { repository, sink, events } = setup([
      { id: 'link-1', text: serializeDiagram(first), path: '/repo/docs/a.diagram.json' },
    ])
    sink.write.mockRejectedValueOnce(new Error('EBUSY'))
    repository.save({ ...first, name: 'Renamed' })
    await repository.settled()
    repository.save({ ...first, name: 'Renamed', viewport: { x: 9, y: 9, zoom: 2 }, rev: first.rev + 1 })
    await repository.settled()
    expect(sink.write).toHaveBeenCalledTimes(2)
    expect(events.at(-1)).toEqual({ kind: 'saved', id: 'link-1' })
  })

  it('reports only the outcome of the last save of a diagram', async () => {
    const { repository, sink, events } = setup()
    let failFirst: (error: Error) => void = () => undefined
    sink.write.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          failFirst = reject
        }),
    )
    const saved = diagram('Saved')
    repository.save(saved)
    repository.save({ ...saved, name: 'Later' })
    failFirst(new Error('locked'))
    await repository.settled()
    expect(events).toEqual([{ kind: 'saved', id: saved.id }])
  })

  it('drops saves that did not reach storage and loads the stored version again', async () => {
    const stored = diagram('Stored', { id: 'a' })
    const { repository, sink, events } = setup([{ id: 'a', text: serializeDiagram(stored) }])
    sink.write.mockRejectedValue(new Error('EPERM'))
    repository.save({ ...stored, name: 'Not stored' })
    const fresh = diagram('Never stored')
    repository.save(fresh)
    await repository.settled()
    events.length = 0

    repository.discardUnstored('a')
    repository.discardUnstored(fresh.id)
    expect(repository.load('a')?.name).toBe('Stored')
    expect(repository.list().map((meta) => meta.id)).toEqual(['a'])
    expect(events).toEqual([
      { kind: 'changed', id: 'a' },
      { kind: 'changed', id: fresh.id },
    ])
    repository.discardUnstored('a')
    expect(events).toHaveLength(2)
  })
})
