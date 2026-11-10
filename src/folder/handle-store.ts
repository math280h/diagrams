const DATABASE = 'dg-folder'
const STORE = 'handles'
const KEY = 'diagrams'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('The browser could not open its folder store.'))
  })
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = work(database.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('The browser could not use its folder store.'))
    })
  } finally {
    database.close()
  }
}

/** Returns the folder that the user opened last, or `null`. The browser can ask again before the app may use it. */
export async function rememberedFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await run<unknown>('readonly', (store) => store.get(KEY))
    return handle instanceof FileSystemDirectoryHandle ? handle : null
  } catch {
    return null
  }
}

export function rememberFolder(handle: FileSystemDirectoryHandle): Promise<IDBValidKey> {
  return run('readwrite', (store) => store.put(handle, KEY))
}

export function forgetFolder(): Promise<undefined> {
  return run('readwrite', (store) => store.delete(KEY))
}
