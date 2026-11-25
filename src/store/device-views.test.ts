import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adoptLegacyView, copyView, deviceView, forgetView, MAX_DEVICE_VIEWS, rememberView } from './device-views'

const KEY = 'dg:views'
let items: Map<string, string>

function stubStorage(overrides: Partial<Storage> = {}) {
  items = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    ...overrides,
  })
}

beforeEach(() => stubStorage())
afterEach(() => vi.unstubAllGlobals())

describe('device views', () => {
  it('keeps the view of each diagram by its id', () => {
    rememberView('d_a', { x: 10, y: -20, zoom: 1.5 })
    rememberView('d_b', { x: 1, y: 2, zoom: 0.5 })
    rememberView('d_a', { x: 30, y: 40, zoom: 2 })
    expect(deviceView('d_a')).toEqual({ x: 30, y: 40, zoom: 2 })
    expect(deviceView('d_b')).toEqual({ x: 1, y: 2, zoom: 0.5 })
    expect(deviceView('d_c')).toBeNull()
  })

  it('stores only the id and the view', () => {
    rememberView('d_a', { x: 10, y: 20, zoom: 1, extra: true } as never)
    expect(JSON.parse(items.get(KEY)!)).toEqual([{ id: 'd_a', x: 10, y: 20, zoom: 1 }])
  })

  it('forgets the view of a diagram', () => {
    rememberView('d_a', { x: 10, y: 20, zoom: 1 })
    rememberView('d_b', { x: 1, y: 2, zoom: 1 })
    forgetView('d_a')
    expect(deviceView('d_a')).toBeNull()
    expect(deviceView('d_b')).not.toBeNull()
  })

  it('keeps at most the newest views, also for ids that look like numbers', () => {
    for (let index = 0; index <= MAX_DEVICE_VIEWS; index++) rememberView(String(index), { x: index, y: 0, zoom: 1 })
    expect(deviceView('0')).toBeNull()
    expect(deviceView('1')).toEqual({ x: 1, y: 0, zoom: 1 })
    rememberView('1', { x: 1, y: 0, zoom: 1 })
    rememberView('d_new', { x: 0, y: 0, zoom: 1 })
    expect(deviceView('1')).not.toBeNull()
    expect(deviceView('2')).toBeNull()
    expect(JSON.parse(items.get(KEY)!)).toHaveLength(MAX_DEVICE_VIEWS)
  })

  it('gives a copy the view of the original', () => {
    rememberView('d_a', { x: 5, y: 6, zoom: 2 })
    copyView('d_a', 'd_copy')
    copyView('d_none', 'd_other')
    expect(deviceView('d_copy')).toEqual({ x: 5, y: 6, zoom: 2 })
    expect(deviceView('d_other')).toBeNull()
  })

  it('reads the views that it can and skips damaged entries', () => {
    items.set(KEY, JSON.stringify([{ id: 'd_a', x: 1, y: 2, zoom: 3 }, { id: 'd_b', x: 'left' }, null]))
    expect(deviceView('d_a')).toEqual({ x: 1, y: 2, zoom: 3 })
    expect(deviceView('d_b')).toBeNull()
    items.set(KEY, '{ nope')
    expect(deviceView('d_a')).toBeNull()
    rememberView('d_a', { x: 1, y: 1, zoom: 1 })
    expect(deviceView('d_a')).toEqual({ x: 1, y: 1, zoom: 1 })
  })

  it('never throws when localStorage is missing, blocked or full', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(() => rememberView('d_a', { x: 1, y: 2, zoom: 1 })).not.toThrow()
    expect(deviceView('d_a')).toBeNull()
    stubStorage({
      getItem: () => {
        throw new DOMException('The user blocks site data.', 'SecurityError')
      },
    })
    expect(deviceView('d_a')).toBeNull()
    stubStorage({
      setItem: () => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      },
    })
    expect(() => rememberView('d_a', { x: 1, y: 2, zoom: 1 })).not.toThrow()
    expect(() => forgetView('d_a')).not.toThrow()
  })
})

describe('adoptLegacyView', () => {
  const older = (viewport: unknown, version = 21) => JSON.stringify({ id: 'd_a', version, viewport })

  it('takes the view of a file of an earlier format when the device has none', () => {
    adoptLegacyView('d_a', older({ x: 40, y: -10, zoom: 1.25 }))
    expect(deviceView('d_a')).toEqual({ x: 40, y: -10, zoom: 1.25 })
  })

  it('keeps the view of the device', () => {
    rememberView('d_a', { x: 1, y: 2, zoom: 3 })
    adoptLegacyView('d_a', older({ x: 40, y: -10, zoom: 1.25 }))
    expect(deviceView('d_a')).toEqual({ x: 1, y: 2, zoom: 3 })
  })

  it.each([
    ['the view at the origin with zoom 1', older({ x: 0, y: 0, zoom: 1 })],
    ['a view that is not valid', older({ x: 1, y: 2, zoom: 0 })],
    ['a file of format 22', older({ x: 1, y: 2, zoom: 1 }, 22)],
    ['text that is not JSON', '{ nope'],
    ['no stored text', null],
  ])('takes no view from %s', (_case, text) => {
    adoptLegacyView('d_a', text)
    expect(deviceView('d_a')).toBeNull()
  })
})
