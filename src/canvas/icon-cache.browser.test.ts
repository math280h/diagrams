import { describe, expect, it, vi } from 'vitest'
import { BUNDLED_ICON_NAMES, cacheVersion, loaded, loadIconNames, preloadIcons, subscribe } from './icon-cache'

function watch() {
  const listener = vi.fn()
  const stop = subscribe(listener)
  return { listener, stop, version: cacheVersion() }
}

describe('icon cache', () => {
  it('has the bundled icons at once and loads nothing for them', async () => {
    expect(BUNDLED_ICON_NAMES.has('database')).toBe(true)
    expect(loaded.has('database')).toBe(true)
    const { listener, stop } = watch()
    await preloadIcons(['database', 'server'])
    expect(listener).not.toHaveBeenCalled()
    stop()
  })

  it('loads another Lucide icon on demand and tells its listeners once', async () => {
    expect(loaded.has('anchor')).toBe(false)
    const { listener, stop, version } = watch()
    await Promise.all([preloadIcons(['anchor', 'anchor']), preloadIcons(['anchor'])])
    expect(loaded.has('anchor')).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(cacheVersion()).toBe(version + 1)
    await preloadIcons(['anchor'])
    expect(listener).toHaveBeenCalledTimes(1)
    stop()
  })

  it('loads an icon of an icon set', async () => {
    const { listener, stop } = watch()
    await preloadIcons(['logo:go'])
    expect(loaded.has('logo:go')).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
    stop()
  })

  it('ignores empty and unknown names', async () => {
    const { listener, stop } = watch()
    await preloadIcons(['', 'not-an-icon', 'logo:not-a-logo'])
    expect(loaded.has('not-an-icon')).toBe(false)
    expect(loaded.has('logo:not-a-logo')).toBe(false)
    expect(listener).not.toHaveBeenCalled()
    stop()
  })

  it('stops telling a listener after it unsubscribes', async () => {
    const { listener, stop } = watch()
    stop()
    await preloadIcons(['bike'])
    expect(loaded.has('bike')).toBe(true)
    expect(listener).not.toHaveBeenCalled()
  })

  it('lists the names of all Lucide icons', async () => {
    const names = await loadIconNames()
    expect(names).toContain('anchor')
    expect(names).toContain('database')
    expect(names.length).toBeGreaterThan(1000)
  })
})
