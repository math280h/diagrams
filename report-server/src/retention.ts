import type { ReportStore } from './storage/store'

const SWEEP_INTERVAL_MS = 60 * 60 * 1000

/**
 * Deletes reports older than the retention time at once and then every hour. Returns a function that stops it.
 *
 * @param onError - Gets the message of a failed sweep. The next sweep tries again.
 */
export function keepRetention(
  store: ReportStore,
  retentionMs: number,
  onError: (message: string) => void,
  now: () => number = Date.now,
): () => void {
  let running = false
  const sweep = async () => {
    if (running) return
    running = true
    try {
      await store.sweep(now() - retentionMs)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'unknown error')
    } finally {
      running = false
    }
  }
  void sweep()
  const timer = setInterval(() => void sweep(), SWEEP_INTERVAL_MS)
  timer.unref()
  return () => clearInterval(timer)
}
