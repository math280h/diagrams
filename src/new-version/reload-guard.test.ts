import { describe, expect, it } from 'vitest'
import { reloadGuard, serverBuildOf } from './reload-guard'

const OLD_BUILD = 'https://draw.example/assets/index-old.js'
const NEW_BUILD = 'https://draw.example/assets/index-new.js'

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const items = new Map<string, string>()
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  }
}

describe('serverBuildOf', () => {
  it('counts a missing entry script as a new version', () => {
    expect(serverBuildOf({ status: 404, contentType: 'text/html' })).toBe('replaced')
    expect(serverBuildOf({ status: 410, contentType: null })).toBe('replaced')
  })

  it('counts the page in place of the script as a new version', () => {
    expect(serverBuildOf({ status: 200, contentType: 'text/html; charset=utf-8' })).toBe('replaced')
  })

  it('keeps the build when the server still sends the script', () => {
    expect(serverBuildOf({ status: 200, contentType: 'text/javascript' })).toBe('same')
    expect(serverBuildOf({ status: 200, contentType: null })).toBe('same')
  })

  it('knows nothing without an answer or with a server error', () => {
    expect(serverBuildOf(null)).toBe('unknown')
    expect(serverBuildOf({ status: 503, contentType: 'text/html' })).toBe('unknown')
    expect(serverBuildOf({ status: 403, contentType: 'text/html' })).toBe('unknown')
  })
})

describe('reloadGuard', () => {
  it('lets a tab reload once for each build', () => {
    const storage = memoryStorage()
    const before = reloadGuard(storage, OLD_BUILD)
    expect(before.reloadedBefore()).toBe(false)
    expect(before.mark()).toBe(true)

    expect(reloadGuard(storage, OLD_BUILD).reloadedBefore()).toBe(true)
  })

  it('lets the tab reload again when the reload got a new build', () => {
    const storage = memoryStorage()
    reloadGuard(storage, OLD_BUILD).mark()
    expect(reloadGuard(storage, NEW_BUILD).reloadedBefore()).toBe(false)
  })

  it('refuses an automatic reload when the tab cannot keep the record', () => {
    const blocked = reloadGuard(null, OLD_BUILD)
    expect(blocked.reloadedBefore()).toBe(false)
    expect(blocked.mark()).toBe(false)

    const full = reloadGuard(
      {
        getItem: () => null,
        setItem: () => {
          throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
        },
      },
      OLD_BUILD,
    )
    expect(full.mark()).toBe(false)
  })

  it('counts a record that it cannot read as no reload', () => {
    const guard = reloadGuard(
      {
        getItem: () => {
          throw new DOMException('Access is denied.', 'SecurityError')
        },
        setItem: () => undefined,
      },
      OLD_BUILD,
    )
    expect(guard.reloadedBefore()).toBe(false)
    expect(guard.mark()).toBe(false)
  })
})
