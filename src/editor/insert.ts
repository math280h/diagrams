import { setUi } from '@/store/ui-store'
import { lastPointer } from './pointer'

type ToFlow = (point: { x: number; y: number }) => { x: number; y: number }

let toFlow: ToFlow | null = null

/** Sets the function that converts screen points to canvas points. */
export function bindInsertProjection(projection: ToFlow | null) {
  toFlow = projection
}

function open(screen: { x: number; y: number }, anchor: { x: number; y: number }) {
  if (!toFlow) return
  setUi({ insert: { screen, flow: toFlow(anchor) } })
}

export function openInsertAtCenter() {
  const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  open({ x: center.x - 140, y: center.y - 120 }, center)
}

/** Opens the insert menu at the last pointer position over the canvas, or at the center. */
export function openInsertAtPointer() {
  const pointer = lastPointer.get()
  if (!pointer) {
    openInsertAtCenter()
    return
  }
  open(pointer, pointer)
}
