export interface DetailsHoverState {
  nodeId: string | null
  /** True after a click, so that the card stays when the pointer leaves the node. */
  pinned: boolean
}

const HIDE_DELAY_MS = 220

export interface DetailsHover {
  subscribe: (listener: () => void) => () => void
  getState: () => DetailsHoverState
  enter: (nodeId: string) => void
  leave: () => void
  /** Keeps the card while the pointer is on it. */
  holdCard: () => void
  toggle: (nodeId: string) => void
  close: () => void
}

/** Creates the state of the details card of one canvas, outside React so that a hover does not render the canvas. */
export function createDetailsHover(): DetailsHover {
  let state: DetailsHoverState = { nodeId: null, pinned: false }
  let hideTimer: ReturnType<typeof setTimeout> | undefined
  const listeners = new Set<() => void>()

  const set = (next: DetailsHoverState) => {
    if (next.nodeId === state.nodeId && next.pinned === state.pinned) return
    state = next
    for (const listener of listeners) listener()
  }
  const cancelHide = () => clearTimeout(hideTimer)

  return {
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getState: () => state,
    enter: (nodeId) => {
      cancelHide()
      if (!state.pinned) set({ nodeId, pinned: false })
    },
    leave: () => {
      cancelHide()
      if (state.pinned) return
      hideTimer = setTimeout(() => set({ nodeId: null, pinned: false }), HIDE_DELAY_MS)
    },
    holdCard: cancelHide,
    toggle: (nodeId) => {
      cancelHide()
      set(state.pinned && state.nodeId === nodeId ? { nodeId: null, pinned: false } : { nodeId, pinned: true })
    },
    close: () => {
      cancelHide()
      set({ nodeId: null, pinned: false })
    },
  }
}
