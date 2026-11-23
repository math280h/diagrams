import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { createDiagram } from '@/model/defaults'
import type { StorageLocation } from './repository'

const DAY_MS = 24 * 60 * 60 * 1000

let persist: Mock<() => Promise<boolean>>
let persisted: Mock<() => Promise<boolean>>
let stored: Map<string, string>

beforeEach(() => {
  persist = vi.fn(async () => true)
  persisted = vi.fn(async () => false)
  stored = new Map()
  vi.stubGlobal('navigator', { storage: { persist, persisted } })
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function pageLoad(location: StorageLocation = { kind: 'browser', budgetBytes: 1000 }) {
  vi.resetModules()
  const [storage, { setRepository, repository }, { createCachedRepository }] = await Promise.all([
    import('./persistent-storage'),
    import('./active-repository'),
    import('./cached-repository'),
  ])
  setRepository(
    createCachedRepository({
      location,
      files: [],
      sink: { write: async () => undefined, remove: async () => undefined },
    }),
  )
  return { ...storage, repository }
}

describe('askForPersistentStorage', () => {
  it('asks once in a page load, and keeps the answer', async () => {
    const { askForPersistentStorage, usePersistentStorage } = await pageLoad()
    await askForPersistentStorage(1000)
    await askForPersistentStorage(2000)
    expect(persist).toHaveBeenCalledTimes(1)
    expect(stored.get('dg:persist-asked-at')).toBe('1000')
    expect(usePersistentStorage.getState().persisted).toBe(true)
  })

  it('does not ask when the storage is already persistent', async () => {
    persisted.mockResolvedValue(true)
    const { askForPersistentStorage, usePersistentStorage } = await pageLoad()
    await askForPersistentStorage()
    expect(persist).not.toHaveBeenCalled()
    expect(usePersistentStorage.getState().persisted).toBe(true)
  })

  it('asks again only 30 days after the last request', async () => {
    persist.mockResolvedValue(false)
    await (await pageLoad()).askForPersistentStorage(0)
    await (await pageLoad()).askForPersistentStorage(29 * DAY_MS)
    expect(persist).toHaveBeenCalledTimes(1)
    await (await pageLoad()).askForPersistentStorage(30 * DAY_MS)
    expect(persist).toHaveBeenCalledTimes(2)
  })

  it('does not ask when it cannot remember the request', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('Full', 'QuotaExceededError')
      },
    })
    await (await pageLoad()).askForPersistentStorage()
    expect(persist).not.toHaveBeenCalled()
  })

  it('does not ask while the diagrams are in a folder', async () => {
    await (await pageLoad({ kind: 'picked-folder', name: 'docs' })).askForPersistentStorage()
    await (await pageLoad({ kind: 'folder', path: '/diagrams' })).askForPersistentStorage()
    expect(persisted).not.toHaveBeenCalled()
    expect(persist).not.toHaveBeenCalled()
  })

  it('takes a refused or failed request as not persistent', async () => {
    persist.mockRejectedValue(new TypeError('No storage'))
    const { askForPersistentStorage, usePersistentStorage } = await pageLoad()
    await askForPersistentStorage()
    expect(usePersistentStorage.getState().persisted).toBe(false)
  })
})

describe('checkPersistentStorage', () => {
  it('gives null in a browser without the Storage API', async () => {
    vi.stubGlobal('navigator', {})
    const { askForPersistentStorage, checkPersistentStorage, usePersistentStorage } = await pageLoad()
    expect(await checkPersistentStorage()).toBeNull()
    await askForPersistentStorage()
    expect(usePersistentStorage.getState().persisted).toBeNull()
    expect(stored.size).toBe(0)
  })
})

describe('askForPersistentStorageOnSave', () => {
  it('asks at the first save, not at the start', async () => {
    const { askForPersistentStorageOnSave, repository } = await pageLoad()
    askForPersistentStorageOnSave()
    await vi.waitFor(() => expect(persisted).not.toHaveBeenCalled())
    expect(persist).not.toHaveBeenCalled()

    repository().save(createDiagram())
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(1))
    repository().save(createDiagram())
    await repository().settled()
    expect(persist).toHaveBeenCalledTimes(1)
  })
})
