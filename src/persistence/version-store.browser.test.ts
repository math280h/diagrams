import { describe, expect, it } from 'vitest'
import { DiagramBuilder } from '@/templates/builder'
import { indexedDbVersionStore, type VersionMeta } from './version-store'

function meta(id: string, diagramId: string, at: number): VersionMeta {
  return { id, diagramId, startedAt: at, at, author: 'you', summary: `Version ${id}` }
}

function diagram(id: string) {
  const b = new DiagramBuilder()
  b.card(0, 0, { title: 'API', lines: ['GET /orders'] })
  return { ...b.build('Shop'), id }
}

describe('indexedDbVersionStore', () => {
  it('keeps versions across store instances and loads their diagrams', async () => {
    const id = `d_${crypto.randomUUID()}`
    await indexedDbVersionStore().put(meta('v1', id, 1), diagram(id), [])
    const store = indexedDbVersionStore()
    expect((await store.list(id)).map((item) => item.id)).toEqual(['v1'])
    const loaded = await store.load('v1')
    expect(loaded?.nodes[0]?.data).toMatchObject({ title: 'API' })
    expect(await store.load('missing')).toBeNull()
  })

  it('removes the versions it is told to, replaces by id, and removes all with the diagram', async () => {
    const id = `d_${crypto.randomUUID()}`
    const store = indexedDbVersionStore()
    for (let index = 1; index <= 3; index++) await store.put(meta(`${id}-v${index}`, id, index), diagram(id), [])
    await store.put(meta(`${id}-v4`, id, 4), diagram(id), [`${id}-v1`])
    expect((await store.list(id)).map((item) => item.id)).toEqual([`${id}-v4`, `${id}-v3`, `${id}-v2`])
    expect(await store.load(`${id}-v1`)).toBeNull()

    await store.put({ ...meta(`${id}-v4`, id, 5), summary: 'Replaced' }, diagram(id), [])
    expect((await store.list(id))[0]).toMatchObject({ id: `${id}-v4`, summary: 'Replaced' })
    expect(await store.list(id)).toHaveLength(3)

    await store.removeDiagram(id)
    expect(await store.list(id)).toEqual([])
    expect(await store.load(`${id}-v4`)).toBeNull()
  })
})
