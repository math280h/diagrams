let x = -1
let y = -1

/** The last pointer position over the canvas, in viewport pixels. */
export const lastPointer = {
  set(nextX: number, nextY: number) {
    x = nextX
    y = nextY
  },
  /** Returns `null` if the pointer did not move over the canvas yet. */
  get(): { x: number; y: number } | null {
    return x < 0 ? null : { x, y }
  },
}
