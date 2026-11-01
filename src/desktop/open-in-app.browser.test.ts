import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDiagram } from '@/model/defaults'
import type { Diagram } from '@/model/schema'
import { RANDOM_KEY_PATTERN } from './constants'
import {
  canOpenInApp,
  closeOpenInApp,
  forgetOpenedInApp,
  openInApp,
  retryOpenInApp,
  useHandoff,
  useOpenedInApp,
} from './open-in-app'

const RETRY_INTERVAL_MS = 500
const RETRY_MS = 15_000
const WINDOWS_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'

type Answer = { status: number; body?: unknown } | 'offline' | 'hang'

let links: string[]
let answers: Answer[]
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

function codeOf(link: string) {
  return new URL(link).searchParams.get('code')!
}

function answer(next: Answer, init: RequestInit | undefined): Promise<Response> {
  if (next === 'offline') return Promise.reject(new TypeError('Failed to fetch'))
  if (next === 'hang') {
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('The request stopped.', 'AbortError')))
    })
  }
  const response = {
    ok: next.status >= 200 && next.status < 300,
    status: next.status,
    json: async () => {
      if (next.body === undefined) throw new SyntaxError('No JSON')
      return next.body
    },
  }
  return Promise.resolve(response as Response)
}

async function settle(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms)
}

function shop(): Diagram {
  return createDiagram('Shop')
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], now: 1_000_000 })
  links = []
  answers = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    links.push(this.href)
  })
  fetchMock = vi.fn<typeof fetch>((_url, init) => answer(answers.shift() ?? 'offline', init))
  vi.spyOn(window, 'fetch').mockImplementation(fetchMock)
  closeOpenInApp()
  useOpenedInApp.setState({ opened: {} })
})

afterEach(() => {
  closeOpenInApp()
  vi.useRealTimers()
  vi.restoreAllMocks()
  delete window.desktop
  localStorage.removeItem('dg:opened-in-app')
})

describe('canOpenInApp', () => {
  it('offers the desktop app only in a browser on a computer', () => {
    const userAgent = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(WINDOWS_CHROME)
    expect(canOpenInApp()).toBe(true)
    userAgent.mockReturnValue(IPHONE)
    expect(canOpenInApp()).toBe(false)
    userAgent.mockReturnValue(WINDOWS_CHROME)
    window.desktop = {} as NonNullable<Window['desktop']>
    expect(canOpenInApp()).toBe(false)
  })
})

describe('openInApp', () => {
  it('starts the app with a deep link and sends the diagram until the app has the code', async () => {
    answers = [{ status: 404 }, { status: 200, body: { diagramId: 'd_new', name: 'Shop in the app' } }]
    const diagram = shop()
    openInApp(() => diagram)
    expect(useHandoff.getState()).toEqual({ status: 'opening', name: 'Shop' })
    expect(links).toHaveLength(1)
    expect(links[0]).toMatch(/^diagrams:\/\/receive\?code=/)
    const code = codeOf(links[0]!)
    expect(code).toMatch(RANDOM_KEY_PATTERN)

    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(useHandoff.getState().status).toBe('opening')
    await settle(RETRY_INTERVAL_MS)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(useHandoff.getState()).toEqual({ status: 'opened', name: 'Shop' })
    expect(useOpenedInApp.getState().opened).toEqual({ [diagram.id]: Date.now() })

    const [url, init] = fetchMock.mock.calls[1]!
    expect(url).toBe(`http://127.0.0.1:27419/handoff/${code}`)
    expect(init).toMatchObject({ method: 'POST', headers: { 'content-type': 'application/json' } })
    expect(JSON.parse(init!.body as string)).toEqual(diagram)
  })

  it('makes a new code for each handoff', () => {
    answers = ['hang', 'hang']
    openInApp(shop)
    openInApp(shop)
    expect(codeOf(links[0]!)).not.toBe(codeOf(links[1]!))
  })

  it('reports a diagram that the app refuses, with the reason of the app', async () => {
    answers = [{ status: 413, body: { message: 'The diagram is too large.' } }]
    openInApp(shop)
    await settle()
    expect(useHandoff.getState()).toEqual({
      status: 'failed',
      name: 'Shop',
      reason: 'refused',
      message: 'The diagram is too large.',
    })
    expect(useOpenedInApp.getState().opened).toEqual({})
  })

  it('gives the status when the app refuses without a reason', async () => {
    answers = [{ status: 500 }]
    openInApp(shop)
    await settle()
    expect(useHandoff.getState()).toMatchObject({ reason: 'refused', message: 'The app answered with status 500.' })
  })

  it('gives up when the app does not answer within the retry time', async () => {
    openInApp(shop)
    await settle(RETRY_MS - RETRY_INTERVAL_MS)
    expect(useHandoff.getState().status).toBe('opening')
    await settle(RETRY_INTERVAL_MS)
    expect(useHandoff.getState()).toEqual({
      status: 'failed',
      name: 'Shop',
      reason: 'unreachable',
      message: 'Could not reach the Diagrams app.',
    })
    expect(fetchMock).toHaveBeenCalledTimes(RETRY_MS / RETRY_INTERVAL_MS)
  })

  it('sends the same diagram again with a new code on retry', async () => {
    answers = [{ status: 500 }]
    const getDiagram = vi.fn(shop)
    openInApp(getDiagram)
    await settle()
    answers = [{ status: 200, body: { diagramId: 'd_new' } }]
    retryOpenInApp()
    expect(getDiagram).toHaveBeenCalledTimes(2)
    expect(links).toHaveLength(2)
    expect(codeOf(links[1]!)).not.toBe(codeOf(links[0]!))
    await settle()
    expect(useHandoff.getState().status).toBe('opened')

    retryOpenInApp()
    expect(links).toHaveLength(2)
  })

  it('stops a handoff when the dialog closes', async () => {
    answers = ['hang']
    openInApp(shop)
    await settle()
    closeOpenInApp()
    expect(useHandoff.getState().status).toBe('idle')
    await settle(RETRY_MS)
    expect(useHandoff.getState().status).toBe('idle')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    retryOpenInApp()
    expect(links).toHaveLength(1)
  })

  it('keeps no error of a failed handoff after a retry or a close', async () => {
    answers = [{ status: 500 }]
    openInApp(shop)
    await settle()
    expect(useHandoff.getState().status).toBe('failed')
    answers = [{ status: 200, body: { diagramId: 'd_new' } }]
    retryOpenInApp()
    expect(useHandoff.getState()).toEqual({ status: 'opening', name: 'Shop' })
    await settle()
    expect(useHandoff.getState()).toEqual({ status: 'opened', name: 'Shop' })

    answers = [{ status: 500 }]
    openInApp(shop)
    await settle()
    closeOpenInApp()
    expect(useHandoff.getState()).toEqual({ status: 'idle' })
  })

  it('replaces a handoff that waits with a new one', async () => {
    answers = ['hang', { status: 200, body: { diagramId: 'd_second' } }]
    openInApp(() => createDiagram('First'))
    openInApp(() => createDiagram('Second'))
    await settle(RETRY_MS)
    expect(useHandoff.getState()).toMatchObject({ status: 'opened', name: 'Second' })
  })

  it('forgets that a diagram opened in the app', async () => {
    answers = [{ status: 200, body: {} }]
    const diagram = shop()
    openInApp(() => diagram)
    await settle()
    expect(Object.keys(useOpenedInApp.getState().opened)).toEqual([diagram.id])
    forgetOpenedInApp(diagram.id)
    expect(useOpenedInApp.getState().opened).toEqual({})
  })
})
