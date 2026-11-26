import { z } from '@/lib/zod'
import { safeLocalStorage } from '@/lib/persist-storage'
import { viewportSchema, type DiagramView } from '@/model/schema'
import { legacyView } from '@/persistence/migrations'

const VIEWS_KEY = 'dg:views'

/** The maximum number of diagrams with a view on this device. A new view then replaces the oldest view. */
export const MAX_DEVICE_VIEWS = 500

const storedViewSchema = viewportSchema.extend({ id: z.string() })

function readViewsOldestFirst(): Map<string, DiagramView> {
  const views = new Map<string, DiagramView>()
  const text = safeLocalStorage.getItem(VIEWS_KEY)
  if (text === null) return views
  let entries: unknown
  try {
    entries = JSON.parse(text)
  } catch {
    return views
  }
  if (!Array.isArray(entries)) return views
  for (const entry of entries) {
    const stored = storedViewSchema.safeParse(entry)
    if (!stored.success) continue
    const { id, x, y, zoom } = stored.data
    views.delete(id)
    views.set(id, { x, y, zoom })
  }
  return views
}

function writeViews(views: Map<string, DiagramView>) {
  const entries = [...views].slice(-MAX_DEVICE_VIEWS).map(([id, view]) => ({ id, ...view }))
  safeLocalStorage.setItem(VIEWS_KEY, JSON.stringify(entries))
}

/** Returns the last editor view of a diagram on this device, or `null` if this device has none. */
export function deviceView(diagramId: string): DiagramView | null {
  return readViewsOldestFirst().get(diagramId) ?? null
}

/** Keeps the editor view of a diagram on this device. */
export function rememberView(diagramId: string, view: DiagramView) {
  const views = readViewsOldestFirst()
  views.delete(diagramId)
  views.set(diagramId, { x: view.x, y: view.y, zoom: view.zoom })
  writeViews(views)
}

export function forgetView(diagramId: string) {
  const views = readViewsOldestFirst()
  if (views.delete(diagramId)) writeViews(views)
}

/** Gives a copy of a diagram the view of the original on this device, if there is one. */
export function copyView(fromId: string, toId: string) {
  const view = deviceView(fromId)
  if (view) rememberView(toId, view)
}

/**
 * Keeps the view in the stored text of a diagram of a format before 22 as the view of this device. It does nothing if
 * this device has a view of the diagram already.
 */
export function adoptLegacyView(diagramId: string, storedText: string | null) {
  if (storedText === null || deviceView(diagramId)) return
  let raw: unknown
  try {
    raw = JSON.parse(storedText)
  } catch {
    return
  }
  const view = legacyView(raw)
  if (view) rememberView(diagramId, view)
}
