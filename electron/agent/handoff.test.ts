import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { createHandoffCodes, mountHandoff } from './handoff'

const CODE = 'b'.repeat(43)
const ORIGIN = 'https://draw.thias.dev'

function setup(open = vi.fn(async () => ({ diagramId: 'd_new', name: 'Shop' }))) {
  let now = 0
  const codes = createHandoffCodes({ ttlMs: 1000, now: () => now })
  const focus = vi.fn()
  const app = new Hono()
  mountHandoff(app, { codes, origins: () => [ORIGIN], open, focus })
  const post = (body: string, headers: Record<string, string> = {}, code = CODE) =>
    app.request(`/handoff/${code}`, {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers },
      body,
    })
  return { codes, open, focus, post, advance: (ms: number) => (now += ms), app }
}

describe('createHandoffCodes', () => {
  it('accepts each code once, until it expires', () => {
    const { codes, advance } = setup()
    expect(codes.add('short')).toBe(false)
    expect(codes.add(CODE)).toBe(true)
    expect(codes.consume(CODE)).toBe(true)
    expect(codes.consume(CODE)).toBe(false)
    codes.add(CODE)
    advance(1001)
    expect(codes.consume(CODE)).toBe(false)
  })
})

describe('POST /handoff/:code', () => {
  it('opens the diagram and brings the window to the front', async () => {
    const { codes, open, focus, post } = setup()
    codes.add(CODE)
    const response = await post('{"name":"Shop"}')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, diagramId: 'd_new', name: 'Shop' })
    expect(open).toHaveBeenCalledWith('{"name":"Shop"}')
    expect(focus).toHaveBeenCalled()
  })

  it('refuses other websites', async () => {
    const { codes, post } = setup()
    codes.add(CODE)
    expect((await post('{}', { origin: 'https://evil.example' })).status).toBe(403)
  })

  it('answers 404 for a code that has not arrived yet, so the website tries again', async () => {
    const { post } = setup()
    expect((await post('{}')).status).toBe(404)
  })

  it('refuses a body that is not a JSON object', async () => {
    const { codes, post } = setup()
    codes.add(CODE)
    expect((await post('[1, 2]')).status).toBe(422)
  })

  it('refuses a body that is not sent as JSON', async () => {
    const { codes, post } = setup()
    codes.add(CODE)
    expect((await post('{}', { 'content-type': 'text/plain' })).status).toBe(415)
  })

  it('passes on the reason when the app cannot read the diagram', async () => {
    const { codes, post } = setup(
      vi.fn(async () => {
        throw new Error('This file is not a diagram.')
      }),
    )
    codes.add(CODE)
    const response = await post('{"nodes":"no"}')
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ message: 'This file is not a diagram.' })
  })

  it('allows the website in a preflight request and grants private network access', async () => {
    const { app } = setup()
    const allowed = await app.request(`/handoff/${CODE}`, {
      method: 'OPTIONS',
      headers: {
        origin: ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
        'access-control-request-private-network': 'true',
      },
    })
    expect(allowed.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(allowed.headers.get('access-control-allow-private-network')).toBe('true')
    const denied = await app.request(`/handoff/${CODE}`, {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
    })
    expect(denied.headers.get('access-control-allow-origin')).toBeNull()
  })
})
