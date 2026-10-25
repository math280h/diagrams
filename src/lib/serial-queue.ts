/**
 * Creates a queue that runs tasks one after another.
 *
 * A task starts only when the task before it ends. A task whose signal aborts while it waits rejects at once and
 * never starts.
 */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve()
  return function enqueue<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const run = tail.then(() => {
      if (signal?.aborted) throw new Error('The request was cancelled.')
      return task()
    })
    tail = run.catch(() => undefined)
    if (!signal) return run
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(new Error('The request was cancelled.'))
      signal.addEventListener('abort', onAbort, { once: true })
      run.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
    })
  }
}
