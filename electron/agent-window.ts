import type { AgentWindowMode } from '@/desktop/contract'
import type { WindowShow } from './window'

/**
 * Returns how a window that the user cannot see shows for an agent call, or `null` if it stays hidden.
 *
 * @param readOnly - True for a tool that only reads. It never shows the window.
 */
export function agentWindowShow(mode: AgentWindowMode, readOnly: boolean): WindowShow | null {
  if (readOnly || mode === 'hidden') return null
  return mode === 'focus' ? 'focus' : 'inactive'
}

/**
 * Counts the agent calls that run, and calls `close` after `delayMs` without a running call.
 *
 * @returns `start` marks the start of a call and returns the function that marks its end. `stop` cancels a due close.
 */
export function createIdleClose(delayMs: number, close: () => void) {
  let running = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    start(): () => void {
      running += 1
      clearTimeout(timer)
      let ended = false
      return () => {
        if (ended) return
        ended = true
        running -= 1
        if (running === 0) timer = setTimeout(close, delayMs)
      }
    },
    stop() {
      clearTimeout(timer)
    },
  }
}
