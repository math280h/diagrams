import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDiagram, DEFAULT_THEME } from '@/model/defaults'
import { DIAGRAM_VERSION, type Diagram } from '@/model/schema'
import { DiagramBuilder } from '@/templates/builder'
import { DiagramFormatError } from './migrations'
import { localRepository, STORAGE_BUDGET_BYTES, type RepositoryEvent } from './repository'

const INDEX_KEY = 'dg:index'
const diagramKey = (id: string) => `dg:diagram:${id}`

const usedIds = new Set<string>()

function diagram(name: string, updatedAt: number): Diagram {
  const builder = new DiagramBuilder()
  builder.card(0, 0, { title: 'API' })
  builder.card(300, 0, { title: 'Database' })
  const built = { ...builder.build(name), id: `d_${crypto.randomUUID()}`, updatedAt }
  usedIds.add(built.id)
  return built
}

function listed(ids: string[]) {
  return localRepository.list().filter((meta) => ids.includes(meta.id))
}

function collectEvents() {
  const events: RepositoryEvent[] = []
  const stop = localRepository.subscribe((event) => events.push(event))
  return { events, stop }
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const id of usedIds) localRepository.remove(id)
  usedIds.clear()
})

describe('localRepository', () => {
  it('saves a diagram, loads it back and lists it newest first', () => {
    const older = diagram('Older', 1_000)
    const newer = diagram('Newer', 2_000)
    expect(localRepository.save(older)).toEqual({ ok: true })
    expect(localRepository.save(newer)).toEqual({ ok: true })

    expect(localRepository.load(older.id)).toEqual(older)
    expect(listed([older.id, newer.id])).toEqual([
      { id: newer.id, name: 'Newer', updatedAt: 2_000, nodeCount: 2, flowCount: 0 },
      { id: older.id, name: 'Older', updatedAt: 1_000, nodeCount: 2, flowCount: 0 },
    ])
  })

  it('keeps one list entry for a diagram that it saves again', () => {
    const shop = diagram('Shop', 1_000)
    localRepository.save(shop)
    localRepository.save({ ...shop, name: 'Store', updatedAt: 3_000 })
    expect(listed([shop.id])).toEqual([expect.objectContaining({ name: 'Store', updatedAt: 3_000 })])
    expect(localRepository.load(shop.id)?.name).toBe('Store')
  })

  it('returns null for a diagram that it does not have', () => {
    expect(localRepository.load(`d_${crypto.randomUUID()}`)).toBeNull()
  })

  it('migrates a diagram of an older format when it loads', () => {
    const id = `d_${crypto.randomUUID()}`
    usedIds.add(id)
    const { routeAround: _routeAround, ...olderTheme } = DEFAULT_THEME
    localStorage.setItem(
      diagramKey(id),
      JSON.stringify({ ...createDiagram('Old'), id, version: 15, theme: olderTheme }),
    )
    expect(localRepository.load(id)?.theme).toEqual({ ...DEFAULT_THEME, routeAround: false })
  })

  it('refuses a diagram of a newer format', () => {
    const id = `d_${crypto.randomUUID()}`
    usedIds.add(id)
    localStorage.setItem(diagramKey(id), JSON.stringify({ ...createDiagram('New'), id, version: DIAGRAM_VERSION + 1 }))
    expect(() => localRepository.load(id)).toThrow(DiagramFormatError)
  })

  it('removes a diagram and its list entry', () => {
    const gone = diagram('Gone', 1_000)
    localRepository.save(gone)
    localRepository.remove(gone.id)
    expect(localRepository.load(gone.id)).toBeNull()
    expect(listed([gone.id])).toEqual([])
  })

  it('skips list entries that are not valid', () => {
    const kept = diagram('Kept', 1_000)
    localRepository.save(kept)
    const index = localStorage.getItem(INDEX_KEY)!
    try {
      const entries = JSON.parse(index) as { id: string }[]
      localStorage.setItem(INDEX_KEY, JSON.stringify([...entries, { id: 'no-name' }, 'text', null]))
      expect(
        localRepository
          .list()
          .map((meta) => meta.id)
          .toSorted(),
      ).toEqual(entries.map((entry) => entry.id).toSorted())
      expect(listed([kept.id])).toHaveLength(1)

      localStorage.setItem(INDEX_KEY, '{"not":"a list"}')
      expect(localRepository.list()).toEqual([])
      localStorage.setItem(INDEX_KEY, '[{ broken')
      expect(localRepository.list()).toEqual([])
    } finally {
      localStorage.setItem(INDEX_KEY, index)
    }
  })

  it('reports each save and remove to its listeners until they unsubscribe', () => {
    const shop = diagram('Shop', 1_000)
    const { events, stop } = collectEvents()
    localRepository.save(shop)
    localRepository.remove(shop.id)
    stop()
    localRepository.save(shop)
    expect(events).toEqual([
      { kind: 'saved', id: shop.id },
      { kind: 'removed', id: shop.id },
    ])
  })

  it.each(['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'])(
    'reports a full storage (%s) and keeps the earlier save',
    (name) => {
      const shop = diagram('Shop', 1_000)
      localRepository.save(shop)
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('The quota has been exceeded.', name)
      })
      const { events, stop } = collectEvents()
      const result = localRepository.save({ ...shop, name: 'Too big' })
      stop()
      expect(result).toEqual({ ok: false, reason: 'quota', message: 'The browser storage is full.' })
      expect(events).toEqual([
        { kind: 'save-failed', id: shop.id, reason: 'quota', message: 'The browser storage is full.' },
      ])
      vi.restoreAllMocks()
      expect(localRepository.load(shop.id)?.name).toBe('Shop')
    },
  )

  it('reports another storage error with its message', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage is turned off.')
    })
    expect(localRepository.save(diagram('Shop', 1_000))).toEqual({
      ok: false,
      reason: 'unknown',
      message: 'Storage is turned off.',
    })
  })

  it('counts the size of its own keys only, two bytes for each character', () => {
    const ownKey = `dg:test-${crypto.randomUUID()}`
    const otherKey = `other-${crypto.randomUUID()}`
    const before = localRepository.usageBytes()
    try {
      localStorage.setItem(otherKey, 'x'.repeat(1_000))
      expect(localRepository.usageBytes()).toBe(before)
      localStorage.setItem(ownKey, 'abc')
      expect(localRepository.usageBytes()).toBe(before + (ownKey.length + 3) * 2)
    } finally {
      localStorage.removeItem(ownKey)
      localStorage.removeItem(otherKey)
    }
  })

  it('reports changes that another tab makes to a diagram or to the list', () => {
    const { events, stop } = collectEvents()
    window.dispatchEvent(new StorageEvent('storage', { key: diagramKey('d_other') }))
    window.dispatchEvent(new StorageEvent('storage', { key: INDEX_KEY }))
    window.dispatchEvent(new StorageEvent('storage', { key: null }))
    window.dispatchEvent(new StorageEvent('storage', { key: 'dg:settings' }))
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }))
    stop()
    window.dispatchEvent(new StorageEvent('storage', { key: diagramKey('d_after') }))
    expect(events).toEqual([
      { kind: 'changed', id: 'd_other' },
      { kind: 'changed', id: null },
      { kind: 'changed', id: null },
    ])
  })

  it('stores in the browser and has nothing that waits', async () => {
    expect(localRepository.location).toEqual({ kind: 'browser', budgetBytes: STORAGE_BUDGET_BYTES })
    await expect(localRepository.settled()).resolves.toBeUndefined()
  })
})
