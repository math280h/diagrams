import { mkdirSync, watch, type FSWatcher } from 'node:fs'
import type { FileChange } from '@/desktop/contract'
import path from 'node:path'
import { idOfFile, isTempFile, type DiagramFiles } from './diagram-files'
import type { LinkedFiles } from './linked-files'

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

/**
 * Watches the folders of the linked files and reports changes that other programs make to the linked files.
 *
 * @returns Functions that check every file again, follow a changed list of files, and stop the watcher.
 */
export function watchLinkedFiles(linked: LinkedFiles, onChange: (change: FileChange) => void) {
  const watchers = new Map<string, FSWatcher>()
  const timers = new Map<string, NodeJS.Timeout>()

  const report = (change: FileChange | null) => {
    if (!change) return
    onChange(change.kind === 'changed' ? { ...change, path: linked.pathOf(change.id) ?? undefined } : change)
  }
  const schedule = (id: string) => {
    clearTimeout(timers.get(id))
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id)
        void linked.inspect(id).then(report)
      }, DEBOUNCE_MS),
    )
  }

  const sync = () => {
    const folders = new Set(linked.entries().map(({ file }) => path.dirname(file)))
    for (const [folder, watcher] of watchers) {
      if (folders.has(folder)) continue
      watcher.close()
      watchers.delete(folder)
    }
    for (const folder of folders) {
      if (watchers.has(folder)) continue
      try {
        const watcher = watch(folder, (_event, name) => {
          if (!name || isTempFile(name)) return
          for (const { id, file } of linked.entries()) {
            if (path.dirname(file) === folder && path.basename(file) === name) schedule(id)
          }
        })
        watcher.on('error', () => {
          watcher.close()
          watchers.delete(folder)
        })
        watchers.set(folder, watcher)
      } catch {
        continue
      }
    }
  }

  return {
    sync,
    rescan: () => void linked.rescan().then((changes) => changes.forEach(onChange)),
    stop() {
      for (const timer of timers.values()) clearTimeout(timer)
      for (const watcher of watchers.values()) watcher.close()
      watchers.clear()
    },
  }
}
