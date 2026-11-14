import type { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { HANDOFF_PATH, MAX_HANDOFF_BYTES, RANDOM_KEY_PATTERN } from '@/desktop/constants'
import { errorMessage } from '@/lib/error-message'

const MAX_PENDING_CODES = 20
const PREFLIGHT_MAX_AGE_S = 600

export type HandoffCodes = ReturnType<typeof createHandoffCodes>

/** Keeps the handoff codes that arrived through deep links. Each code works once, for a limited time. */
export function createHandoffCodes(options: { ttlMs: number; now?: () => number }) {
  const now = options.now ?? Date.now
  const codes = new Map<string, number>()

  const prune = () => {
    for (const [code, expiresAt] of codes) if (expiresAt <= now()) codes.delete(code)
  }

  return {
    /** Accepts a code from a deep link. Returns false for a code with the wrong form. */
    add(code: string): boolean {
      if (!RANDOM_KEY_PATTERN.test(code)) return false
      prune()
      if (codes.size >= MAX_PENDING_CODES) codes.delete(codes.keys().next().value!)
      codes.set(code, now() + options.ttlMs)
      return true
    },
    /** Returns true if the code arrived and is not used or expired. */
    has(code: string): boolean {
      prune()
      return codes.has(code)
    },
    /** Uses a code. Returns false if the code is unknown, used or expired. */
    consume(code: string): boolean {
      prune()
      return codes.delete(code)
    },
    /** Returns the codes that are not used or expired. */
    pending(): string[] {
      prune()
      return [...codes.keys()]
    },
  }
}

export interface HandoffOptions {
  codes: HandoffCodes
  /** Returns the website origins that may send diagrams. */
  origins: () => readonly string[]
  /** Opens the diagram JSON in the app and returns the new diagram. */
  open: (text: string) => Promise<{ diagramId: string; name: string }>
  focus: () => void
}

function isJsonObject(text: string) {
  try {
    const value: unknown = JSON.parse(text)
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  } catch {
    return false
  }
}

const NOT_ALLOWED = 'This website may not send diagrams to the app. Add it under Websites in the app settings.'

/**
 * Adds the routes of the handoff from the website. `GET /handoff/:code` answers `{ received, allowed }` to each
 * website, so that the website sends the diagram only to the app that received the code, and can tell the user when
 * that app does not take diagrams from it. `POST /handoff/:code` receives the diagram, only from an allowed website.
 */
export function mountHandoff(app: Hono, options: HandoffOptions) {
  const route = `${HANDOFF_PATH}/*`
  app.use(route, async (c, next) => {
    await next()
    if (c.req.header('access-control-request-private-network') === 'true') {
      c.res.headers.set('Access-Control-Allow-Private-Network', 'true')
    }
  })
  app.use(
    route,
    cors({
      origin: (origin, c) => {
        const method = c.req.method === 'OPTIONS' ? c.req.header('access-control-request-method') : c.req.method
        return method === 'GET' || options.origins().includes(origin) ? origin : null
      },
      allowMethods: ['GET', 'POST'],
      allowHeaders: ['Content-Type'],
      maxAge: PREFLIGHT_MAX_AGE_S,
    }),
  )
  app.get(`${HANDOFF_PATH}/:code`, (c) => {
    const origin = c.req.header('origin')
    if (!origin) return c.json({ message: NOT_ALLOWED }, 403)
    return c.json({ received: options.codes.has(c.req.param('code')), allowed: options.origins().includes(origin) })
  })
  app.post(
    `${HANDOFF_PATH}/:code`,
    bodyLimit({
      maxSize: MAX_HANDOFF_BYTES,
      onError: (c) => c.json({ message: 'The diagram is too large.' }, 413),
    }),
    async (c) => {
      const origin = c.req.header('origin')
      if (!origin || !options.origins().includes(origin)) return c.json({ message: NOT_ALLOWED }, 403)
      if (!c.req.header('content-type')?.startsWith('application/json')) {
        return c.json({ message: 'Send the diagram as JSON.' }, 415)
      }
      if (!options.codes.consume(c.req.param('code'))) {
        return c.json({ message: 'The app has not received this link yet.' }, 404)
      }
      const text = await c.req.text()
      if (!isJsonObject(text)) return c.json({ message: 'The request is not a diagram.' }, 422)
      try {
        const opened = await options.open(text)
        options.focus()
        return c.json({ ok: true, ...opened })
      } catch (error) {
        return c.json({ message: errorMessage(error) }, 422)
      }
    },
  )
}
