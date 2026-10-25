import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '@/desktop/contract'

const listeners = new Map<string, (event: { sender: unknown }, payload?: unknown) => void>()

vi.mock('electron', () => ({
  ipcMain: {
    on: (channel: string, listener: (event: { sender: unknown }, payload?: unknown) => void) =>
      listeners.set(channel, listener),
  },
}))

const { createRendererRpc } = await import('./renderer-rpc')

class FakeContents extends EventEmitter {
  readonly sent: { channel: string; payload: unknown }[] = []
  send(channel: string, payload: unknown) {
    this.sent.push({ channel, payload })
  }
  isDestroyed() {
    return false
  }
}

function setup() {
  const rpc = createRendererRpc()
  const contents = new FakeContents()
  rpc.attach(contents as unknown as Electron.WebContents)
  const ready = () => listeners.get(IPC_CHANNELS.ready)?.({ sender: contents })
  return { rpc, contents, ready }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('createRendererRpc', () => {
  it('ends a call at its own time limit while the renderer has not started', async () => {
    const { rpc } = setup()
    const call = rpc.call('app.flush', null, { timeoutMs: 3000 })
    const outcome = expect(call).rejects.toThrow('did not start in time')
    await vi.advanceTimersByTimeAsync(3000)
    await outcome
  })

  it('counts the wait for the renderer as part of the time limit', async () => {
    const { rpc, contents, ready } = setup()
    const call = rpc.call('app.flush', null, { timeoutMs: 3000 })
    const outcome = expect(call).rejects.toThrow('did not answer within 3000 ms')
    await vi.advanceTimersByTimeAsync(2000)
    ready()
    await vi.advanceTimersByTimeAsync(0)
    expect(contents.sent.some((message) => message.channel === IPC_CHANNELS.call)).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)
    await outcome
  })

  it('stops the wait for the renderer when the request is cancelled', async () => {
    const { rpc, contents } = setup()
    const controller = new AbortController()
    const call = rpc.call('app.flush', null, { timeoutMs: 20_000, signal: controller.signal })
    const outcome = expect(call).rejects.toThrow('cancelled')
    controller.abort()
    await outcome
    expect(contents.sent).toEqual([])
  })
})
