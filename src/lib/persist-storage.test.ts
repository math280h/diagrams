import { afterEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { localPersistStorage } from './persist-storage'

function counterStore() {
  return create<{ count: number }>()(persist(() => ({ count: 0 }), { name: 'dg:test', storage: localPersistStorage() }))
}

function mapStorage() {
  const items = new Map<string, string>()
  return {
    items,
    storage: {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      removeItem: (key: string) => void items.delete(key),
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('localPersistStorage', () => {
  it('writes the state to localStorage, and a new store reads it back', () => {
    const { items, storage } = mapStorage()
    vi.stubGlobal('localStorage', storage)
    counterStore().setState({ count: 2 })
    expect(JSON.parse(items.get('dg:test')!)).toEqual({ state: { count: 2 }, version: 0 })
    expect(counterStore().getState().count).toBe(2)
  })

  it.each([
    ['is undefined', () => vi.stubGlobal('localStorage', undefined)],
    [
      'throws on access',
      () => {
        vi.stubGlobal('localStorage', undefined)
        Object.defineProperty(globalThis, 'localStorage', {
          get: () => {
            throw new DOMException('The user blocks site data.', 'SecurityError')
          },
        })
      },
    ],
    [
      'refuses each write',
      () =>
        vi.stubGlobal('localStorage', {
          ...mapStorage().storage,
          setItem: () => {
            throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
          },
        }),
    ],
  ])('keeps the state in memory when localStorage %s', (_case, breakStorage) => {
    breakStorage()
    const store = counterStore()
    store.setState({ count: 3 })
    expect(store.getState().count).toBe(3)
    store.persist.clearStorage()
  })
})

describe('persisted stores of the app', () => {
  it('change their state when localStorage is undefined at module load', async () => {
    vi.stubGlobal('localStorage', undefined)
    const { forgetOpenedInApp, useDesktopAppSeen, useOpenedInApp } = await import('@/desktop/open-in-app')
    const { hideAgentIntro, useAgentHistory } = await import('@/desktop/agent-store')
    const { useFolderSettings } = await import('@/folder/folder-store')
    const { hideInstallIntro } = await import('@/install/install-prompt')
    const { useSettings } = await import('@/store/settings-store')

    useOpenedInApp.setState({ opened: { d_shop: 1 } })
    forgetOpenedInApp('d_shop')
    useDesktopAppSeen.setState({ seenAt: 1 })
    hideAgentIntro()
    useFolderSettings.setState({ agents: true })
    hideInstallIntro()
    useSettings.getState().setShowMinimap(false)

    expect(useOpenedInApp.getState().opened).toEqual({})
    expect(useDesktopAppSeen.getState().seenAt).toBe(1)
    expect(useAgentHistory.getState().introHidden).toBe(true)
    expect(useFolderSettings.getState().agents).toBe(true)
    expect(useSettings.getState().showMinimap).toBe(false)
  })
})
