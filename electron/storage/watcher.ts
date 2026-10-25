import { mkdirSync, watch, type FSWatcher } from 'node:fs'
import type { FileChange } from '@/desktop/contract'
import { idOfFile, isTempFile, type DiagramFiles } from './diagram-files'

const DEBOUNCE_MS = 150
const RESTART_DELAY_MS = 1000

/**
 * Watches the diagram folder and reports changes that other programs make.
 *
 * @returns A function that stops the watcher.
 */
export function watchDiagramFolder(files: DiagramFiles, onChange: (change: FileChange) => void) {
  const timers = new Map<string, NodeJS.Timeout>()
  let watcher: FSWatcher | null = null
  let restartTimer: NodeJS.Timeout | undefined
  let stopped = false

  const report = (changes: (FileChange | null)[]) => {
    for (const change of changes) if (change) onChange(change)
  }

  const rescan = () => void files.rescan().then(report)

  const schedule = (id: string) => {
    clearTimeout(timers.get(id))
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id)
        void files.inspect(id).then((change) => report([change]))
      }, DEBOUNCE_MS),
    )
  }

  const start = () => {
    if (stopped) return
    try {
      mkdirSync(files.folder, { recursive: true })
      watcher = watch(files.folder, (_event, name) => {
        if (!name) return rescan()
        if (isTempFile(name)) return
        const id = idOfFile(name)
        if (id) schedule(id)
      })
      watcher.on('error', () => {
        watcher?.close()
        watcher = null
        restartTimer = setTimeout(() => {
          start()
          rescan()
        }, RESTART_DELAY_MS)
      })
    } catch {
      restartTimer = setTimeout(start, RESTART_DELAY_MS)
    }
  }

  start()

  return {
    rescan,
    stop() {
      stopped = true
      clearTimeout(restartTimer)
      for (const timer of timers.values()) clearTimeout(timer)
      watcher?.close()
    },
  }
}
