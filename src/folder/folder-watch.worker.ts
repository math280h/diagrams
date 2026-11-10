import { DIAGRAM_FILE_SUFFIX } from '@/desktop/constants'
import { AGENT_FOLDER, CALLS_FOLDER, CALL_SUFFIX } from './agent-paths'

export type FolderWatchRequest =
  | { kind: 'start'; folder: FileSystemDirectoryHandle; intervalMs: number; calls: boolean }
  | { kind: 'calls'; calls: boolean }

export type FolderWatchReply =
  | { kind: 'files'; names: string[] }
  | { kind: 'calls'; names: string[] }
  | { kind: 'error'; message: string }

interface WorkerScope {
  onmessage: ((event: MessageEvent<FolderWatchRequest>) => void) | null
  postMessage(message: FolderWatchReply, transfer: Transferable[]): void
}

const scope = self as unknown as WorkerScope
let folder: FileSystemDirectoryHandle | null = null
let intervalMs = 1000
let watchCalls = false
let stamps = new Map<string, string>()

async function fileStamps(directory: FileSystemDirectoryHandle, suffix: string) {
  const found = new Map<string, string>()
  for await (const [name, handle] of directory.entries()) {
    if (handle.kind !== 'file' || !name.endsWith(suffix)) continue
    const file = await handle.getFile()
    found.set(name, `${file.lastModified}:${file.size}`)
  }
  return found
}

async function callNames(root: FileSystemDirectoryHandle): Promise<string[]> {
  try {
    const calls = await (await root.getDirectoryHandle(AGENT_FOLDER)).getDirectoryHandle(CALLS_FOLDER)
    return [...(await fileStamps(calls, CALL_SUFFIX)).keys()].toSorted()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return []
    throw error
  }
}

async function scan(root: FileSystemDirectoryHandle) {
  const next = await fileStamps(root, DIAGRAM_FILE_SUFFIX)
  const names = [...next].filter(([name, stamp]) => stamps.get(name) !== stamp).map(([name]) => name)
  for (const name of stamps.keys()) if (!next.has(name)) names.push(name)
  stamps = next
  if (names.length > 0) scope.postMessage({ kind: 'files', names }, [])
  if (watchCalls) {
    const calls = await callNames(root)
    if (calls.length > 0) scope.postMessage({ kind: 'calls', names: calls }, [])
  }
}

async function tick(root: FileSystemDirectoryHandle) {
  if (folder !== root) return
  try {
    await scan(root)
  } catch (error) {
    scope.postMessage({ kind: 'error', message: error instanceof Error ? error.message : String(error) }, [])
  }
  setTimeout(() => void tick(root), intervalMs)
}

scope.onmessage = ({ data }) => {
  if (data.kind === 'calls') {
    watchCalls = data.calls
    return
  }
  folder = data.folder
  intervalMs = data.intervalMs
  watchCalls = data.calls
  stamps = new Map()
  void tick(data.folder)
}
