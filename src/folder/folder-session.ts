import type { FileChange } from '@/desktop/contract'
import { createCachedRepository, type CachedRepository } from '@/persistence/cached-repository'
import { createFolderFiles, type FolderFiles } from './folder-files'
import type { FolderWatchReply, FolderWatchRequest } from './folder-watch.worker'

const WATCH_INTERVAL_MS = 750

export interface FolderSession {
  folder: FileSystemDirectoryHandle
  files: FolderFiles
  repository: CachedRepository
  /** Starts or stops the reports of agent call files. */
  watchCalls(on: boolean): void
  /** Calls the listener with the names of the call files after each folder scan that finds some. */
  onCalls(listener: (names: string[]) => void): () => void
  /** Calls the listener when a folder scan finds a change in the theme files. */
  onThemes(listener: () => void): () => void
  /** Calls the listener when a folder scan fails, for example after the browser takes back the permission. */
  onProblem(listener: (message: string) => void): () => void
  stop(): void
}

/** Opens the diagram files of a folder as the repository and follows changes from outside with a worker. */
export async function openFolderSession(folder: FileSystemDirectoryHandle): Promise<FolderSession> {
  let reportOutside: (change: FileChange) => void = () => undefined
  const files = createFolderFiles(folder, (change) => reportOutside(change))
  const repository = createCachedRepository({
    location: { kind: 'picked-folder', name: folder.name },
    files: await files.list(),
    sink: { write: (file) => files.write(file), remove: (id) => files.remove(id) },
  })
  reportOutside = (change) => repository.applyExternal(change)
  const callListeners = new Set<(names: string[]) => void>()
  const themeListeners = new Set<() => void>()
  const problemListeners = new Set<(message: string) => void>()
  let reading = Promise.resolve()

  const worker = new Worker(new URL('./folder-watch.worker.ts', import.meta.url), {
    type: 'module',
    name: 'folder-watch',
  })
  const send = (request: FolderWatchRequest) => worker.postMessage(request, [])
  worker.onmessage = ({ data }: MessageEvent<FolderWatchReply>) => {
    if (data.kind === 'files') {
      reading = reading
        .then(async () => {
          for (const change of await files.changes(data.names)) repository.applyExternal(change)
        })
        .catch((error: unknown) => {
          for (const listener of problemListeners) listener(error instanceof Error ? error.message : String(error))
        })
    } else if (data.kind === 'calls') {
      for (const listener of callListeners) listener(data.names)
    } else if (data.kind === 'themes') {
      for (const listener of themeListeners) listener()
    } else {
      for (const listener of problemListeners) listener(data.message)
    }
  }
  send({ kind: 'start', folder, intervalMs: WATCH_INTERVAL_MS, calls: false })

  const listen = <T>(listeners: Set<T>, listener: T) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }
  return {
    folder,
    files,
    repository,
    watchCalls: (calls) => send({ kind: 'calls', calls }),
    onCalls: (listener) => listen(callListeners, listener),
    onThemes: (listener) => listen(themeListeners, listener),
    onProblem: (listener) => listen(problemListeners, listener),
    stop() {
      worker.terminate()
      callListeners.clear()
      themeListeners.clear()
      problemListeners.clear()
    },
  }
}
