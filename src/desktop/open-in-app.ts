import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Diagram } from '@/model/schema'
import { isDesktop } from './bridge'
import {
  AGENT_HOST,
  AGENT_PORT,
  DEEP_LINK_SCHEME,
  HANDOFF_PATH,
  HANDOFF_RETRY_INTERVAL_MS,
  HANDOFF_RETRY_MS,
  RANDOM_KEY_BYTES,
} from './constants'

const MOBILE = /Android|iPhone|iPad|iPod|Mobile/i

type HandoffResult =
  | { ok: true; diagramId: string; name: string }
  | { ok: false; reason: 'unreachable' | 'refused'; message: string }

interface BrowserDevice {
  userAgent: string
  maxTouchPoints: number
  /** True if the primary pointer is a finger, as the `(pointer: coarse)` media query tells. */
  coarsePointer: boolean
}

/** Returns true for a browser on a computer that runs the desktop app, and false on phones and tablets. */
export function isDesktopComputer({ userAgent, maxTouchPoints, coarsePointer }: BrowserDevice): boolean {
  if (MOBILE.test(userAgent)) return false
  // iPadOS Safari sends the user agent of a Mac. No Mac has a touch screen.
  if (/Macintosh/.test(userAgent)) return maxTouchPoints <= 1
  // Chrome on large Android tablets sends the user agent of a Linux computer.
  if (/Linux/.test(userAgent)) return !(maxTouchPoints > 0 && coarsePointer)
  return true
}

/** Returns true where the website can hand a diagram to the desktop app: a desktop browser. */
export function canOpenInApp() {
  return (
    !isDesktop() &&
    typeof window !== 'undefined' &&
    isDesktopComputer({
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints,
      coarsePointer: matchMedia('(pointer: coarse)').matches,
    })
  )
}

function newHandoffCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(RANDOM_KEY_BYTES))
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

/** Opens the deep link that starts the desktop app. Call it inside a click handler. */
function launchDeepLink(code: string) {
  const link = document.createElement('a')
  link.href = `${DEEP_LINK_SCHEME}://receive?code=${encodeURIComponent(code)}`
  link.click()
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

/**
 * Sends a diagram to the desktop app. It tries again while the app starts and has not received the code yet.
 *
 * @returns The new diagram in the app, or why the app did not take it.
 */
async function sendToApp(diagram: Diagram, code: string, signal: AbortSignal): Promise<HandoffResult> {
  const url = `http://${AGENT_HOST}:${AGENT_PORT}${HANDOFF_PATH}/${code}`
  const body = JSON.stringify(diagram)
  const deadline = Date.now() + HANDOFF_RETRY_MS
  while (Date.now() < deadline && !signal.aborted) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal,
      })
      const data = (await response.json().catch(() => ({}))) as { diagramId?: string; name?: string; message?: string }
      if (response.ok) return { ok: true, diagramId: data.diagramId ?? '', name: data.name ?? diagram.name }
      if (response.status !== 404) {
        return {
          ok: false,
          reason: 'refused',
          message: data.message ?? `The app answered with status ${response.status}.`,
        }
      }
    } catch {
      if (signal.aborted) break
    }
    await wait(HANDOFF_RETRY_INTERVAL_MS, signal)
  }
  return { ok: false, reason: 'unreachable', message: 'Could not reach the Diagrams app.' }
}

export const useOpenedInApp = create<{ opened: Record<string, number> }>()(
  persist(() => ({ opened: {} }), { name: 'dg:opened-in-app', storage: createJSONStorage(() => localStorage) }),
)

export function forgetOpenedInApp(id: string) {
  const { [id]: _removed, ...rest } = useOpenedInApp.getState().opened
  useOpenedInApp.setState({ opened: rest })
}

type HandoffState =
  | { status: 'idle' }
  | { status: 'opening'; name: string }
  | { status: 'opened'; name: string }
  | { status: 'failed'; name: string; reason: 'unreachable' | 'refused'; message: string }

let controller: AbortController | null = null
let lastRequest: (() => Diagram) | null = null

export const useHandoff = create<HandoffState>(() => ({ status: 'idle' }))

/**
 * Opens a diagram in the desktop app: it starts the app with a deep link, then sends the diagram to it.
 *
 * Call it inside a click handler, because the browser opens deep links only after a user action.
 */
export function openInApp(getDiagram: () => Diagram) {
  controller?.abort()
  lastRequest = getDiagram
  const diagram = getDiagram()
  const code = newHandoffCode()
  launchDeepLink(code)
  const current = new AbortController()
  controller = current
  useHandoff.setState({ status: 'opening', name: diagram.name })
  void sendToApp(diagram, code, current.signal).then((result) => {
    if (current.signal.aborted) return
    if (result.ok) {
      lastRequest = null
      useOpenedInApp.setState((state) => ({ opened: { ...state.opened, [diagram.id]: Date.now() } }))
      useHandoff.setState({ status: 'opened', name: diagram.name })
    } else {
      useHandoff.setState({ status: 'failed', name: diagram.name, reason: result.reason, message: result.message })
    }
  })
}

/** Sends the last diagram again. Call it inside a click handler. */
export function retryOpenInApp() {
  if (lastRequest) openInApp(lastRequest)
}

export function closeOpenInApp() {
  controller?.abort()
  controller = null
  lastRequest = null
  useHandoff.setState({ status: 'idle' })
}
