import { describe, expect, it } from 'vitest'
import { createSerialQueue } from './serial-queue'

function deferred() {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('createSerialQueue', () => {
  it('starts each task when the task before it ends', async () => {
    const enqueue = createSerialQueue()
    const first = deferred()
    const started: string[] = []
    const a = enqueue(async () => {
      started.push('a')
      await first.promise
      return 'a'
    }, new AbortController().signal)
    const b = enqueue(async () => {
      started.push('b')
      return 'b'
    }, new AbortController().signal)
    await Promise.resolve()
    expect(started).toEqual(['a'])
    first.resolve()
    expect(await Promise.all([a, b])).toEqual(['a', 'b'])
    expect(started).toEqual(['a', 'b'])
  })

  it('rejects a waiting task at once when it is cancelled, and never starts it', async () => {
    const enqueue = createSerialQueue()
    const first = deferred()
    const controller = new AbortController()
    let started = false
    void enqueue(() => first.promise, new AbortController().signal)
    const waiting = enqueue(async () => {
      started = true
    }, controller.signal)
    controller.abort()
    await expect(waiting).rejects.toThrow('cancelled')
    first.resolve()
    await enqueue(async () => undefined, new AbortController().signal)
    expect(started).toBe(false)
  })

  it('goes on after a task fails', async () => {
    const enqueue = createSerialQueue()
    const failed = enqueue(async () => {
      throw new Error('boom')
    }, new AbortController().signal)
    await expect(failed).rejects.toThrow('boom')
    await expect(enqueue(async () => 'next', new AbortController().signal)).resolves.toBe('next')
  })
})

describe('createSerialQueue without a signal', () => {
  it('runs tasks in order', async () => {
    const enqueue = createSerialQueue()
    const ran: number[] = []
    await Promise.all([1, 2, 3].map((value) => enqueue(async () => void ran.push(value))))
    expect(ran).toEqual([1, 2, 3])
  })
})
