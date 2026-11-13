import { act, createElement, Fragment, Profiler } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Icon } from './icon'
import { loaded, preloadIcons } from './icon-cache'

// React writes a warning for each act() call if IS_REACT_ACT_ENVIRONMENT is not true.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null

afterEach(() => {
  act(() => root?.unmount())
  root = null
})

describe('Icon', () => {
  it('renders again only when its own icon loads', async () => {
    expect(loaded.has('anchor')).toBe(false)
    expect(loaded.has('apple')).toBe(false)
    const renders: Record<string, number> = { database: 0, anchor: 0 }
    const counted = (name: string) =>
      createElement(Profiler, { id: name, onRender: () => renders[name]!++ }, createElement(Icon, { name }))
    const container = document.body.appendChild(document.createElement('div'))
    root = createRoot(container)

    act(() => root!.render(counted('database')))
    await act(() => preloadIcons(['apple']))
    expect(renders.database).toBe(1)

    act(() => root!.render(createElement(Fragment, null, counted('database'), counted('anchor'))))
    expect(container.querySelectorAll('svg.lucide')).toHaveLength(1)
    const before = { ...renders }
    await vi.waitFor(() => expect(loaded.has('anchor')).toBe(true))
    await act(async () => {})
    expect(container.querySelectorAll('svg.lucide')).toHaveLength(2)
    expect(renders).toEqual({ database: before.database, anchor: before.anchor! + 1 })
  })
})
