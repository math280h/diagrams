import { useEffect, useState } from 'react'

/** The longest wait for an idle moment before a queued mount runs anyway. */
const IDLE_TIMEOUT_MS = 600

/**
 * Creates a queue that runs one task for each idle moment.
 *
 * @param requestIdle - Calls the function at the next idle moment.
 */
export function createIdleQueue(requestIdle: (run: () => void) => void) {
  const tasks: (() => void)[] = []
  let scheduled = false
  const schedule = () => {
    if (scheduled) return
    scheduled = true
    requestIdle(runNext)
  }
  const runNext = () => {
    scheduled = false
    tasks.shift()?.()
    if (tasks.length > 0) schedule()
  }
  return {
    /**
     * Adds a task to the queue.
     *
     * @returns A function that removes the task if it has not run.
     */
    add(task: () => void): () => void {
      tasks.push(task)
      schedule()
      return () => {
        const index = tasks.indexOf(task)
        if (index >= 0) tasks.splice(index, 1)
      }
    },
  }
}

const mounts = createIdleQueue((run) => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS })
  else setTimeout(run, 16)
})

/**
 * Returns true after the browser had an idle moment for this component, once `wanted` is true. It stays true.
 *
 * All components that use the hook share one queue. At most one of them turns true in each idle moment.
 */
export function useIdleMount(wanted: boolean): boolean {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    if (!wanted || mounted) return
    return mounts.add(() => setMounted(true))
  }, [wanted, mounted])
  return mounted
}
