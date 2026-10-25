import { iconEntry } from '@/canvas/icons/library'
import { defaultCardData, newId } from '@/model/defaults'
import { ELEMENT_Z, snapToGrid } from '@/model/graph'
import { PRESET_BY_ID } from '@/model/presets'
import type { DiagramNode } from '@/model/types'
import { useDoc } from '@/store/doc-store'

export const PRESET_MIME = 'application/x-diagram-preset'

function iconCard(name: string): DiagramNode | null {
  const entry = iconEntry(name)
  if (!entry) return null
  return {
    id: newId('n'),
    type: 'card',
    position: { x: 0, y: 0 },
    width: 216,
    zIndex: ELEMENT_Z,
    data: defaultCardData({ title: entry.title, icon: entry.id, form: entry.form }),
  }
}

/**
 * Creates a node from a preset, with its center at the canvas point.
 *
 * @param presetId - A preset id, or the name of a loaded set icon such as `aws:lambda`. A set icon
 *     gives a card with the product name, the icon and the form of the product.
 */
export function presetNodeAt(presetId: string, center: { x: number; y: number }): DiagramNode | null {
  const node = PRESET_BY_ID.get(presetId)?.create({ x: 0, y: 0 }) ?? iconCard(presetId)
  if (!node) return null
  const width = node.width ?? 160
  const height = node.height ?? 72
  const place = useDoc.getState().theme.snap ? snapToGrid : Math.round
  return { ...node, position: { x: place(center.x - width / 2), y: place(center.y - height / 2) } }
}
