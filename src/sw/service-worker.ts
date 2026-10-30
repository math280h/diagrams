import { type AssetList, CACHE_ALL_MESSAGE, HASHED_FOLDER } from './asset-list'

declare const self: ServiceWorkerGlobalScope
/** The path of the asset list of this build. The build puts it in. Its content hash names the build. */
declare const ASSET_LIST_PATH: string

const HASHED_CACHE = 'dg-assets'
const PAGES_CACHE_PREFIX = 'dg-pages-'
const PAGES_CACHE = `${PAGES_CACHE_PREFIX}${ASSET_LIST_PATH}`
const SHELL_PATH = '/'
const NAVIGATION_TIMEOUT_MS = 4000
const PARALLEL_FETCHES = 6
// A server can answer with Vary: Origin, and a module script request has an Origin header that a fetch here does not.
const MATCH: CacheQueryOptions = { ignoreVary: true }

let assetList: Promise<AssetList> | null = null
let cachingAll: Promise<void> | null = null

function loadAssetList(): Promise<AssetList> {
  assetList ??= (async () => {
    const pages = await caches.open(PAGES_CACHE)
    let response = await pages.match(ASSET_LIST_PATH)
    if (!response) {
      response = await fetch(ASSET_LIST_PATH, { cache: 'no-cache' })
      if (!response.ok) throw new Error(`The asset list answered with status ${response.status}.`)
      await pages.put(ASSET_LIST_PATH, response.clone())
    }
    return (await response.json()) as AssetList
  })()
  assetList.catch(() => {
    assetList = null
  })
  return assetList
}

function cacheFor(path: string): Promise<Cache> {
  return caches.open(path.startsWith(HASHED_FOLDER) ? HASHED_CACHE : PAGES_CACHE)
}

async function cachedPaths(cache: Cache): Promise<Set<string>> {
  return new Set((await cache.keys()).map((request) => new URL(request.url).pathname))
}

/**
 * Fetches the paths that the caches do not have yet.
 *
 * @param strict - If true, the first failed fetch rejects, so that the install fails and runs again later.
 */
async function cacheMissing(paths: readonly string[], strict: boolean) {
  const hashed = await cachedPaths(await caches.open(HASHED_CACHE))
  const pages = await cachedPaths(await caches.open(PAGES_CACHE))
  const missing = paths.filter((path) => !(path.startsWith(HASHED_FOLDER) ? hashed : pages).has(path))
  for (let start = 0; start < missing.length; start += PARALLEL_FETCHES) {
    await Promise.all(
      missing.slice(start, start + PARALLEL_FETCHES).map(async (path) => {
        try {
          const response = await fetch(path, { cache: path.startsWith(HASHED_FOLDER) ? 'default' : 'no-cache' })
          if (!response.ok) throw new Error(`${path} answered with status ${response.status}.`)
          await (await cacheFor(path)).put(path, response)
        } catch (error) {
          if (strict) throw error
        }
      }),
    )
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const list = await loadAssetList()
      await cacheMissing([SHELL_PATH, ...list.shell, ...list.precache], true)
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const list = await loadAssetList()
      for (const name of await caches.keys()) {
        if (name.startsWith(PAGES_CACHE_PREFIX) && name !== PAGES_CACHE) await caches.delete(name)
      }
      const current = new Set(list.all)
      const hashed = await caches.open(HASHED_CACHE)
      for (const request of await hashed.keys()) {
        if (!current.has(new URL(request.url).pathname)) await hashed.delete(request)
      }
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data !== CACHE_ALL_MESSAGE) return
  cachingAll ??= loadAssetList()
    .then((list) => cacheMissing(list.all, false))
    .finally(() => {
      cachingAll = null
    })
  event.waitUntil(cachingAll)
})

async function withTimeout(request: Request, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(request, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function networkFirst(request: Request, cacheAs: string | null, timeoutMs?: number): Promise<Response> {
  const pages = await caches.open(PAGES_CACHE)
  try {
    const response = timeoutMs === undefined ? await fetch(request) : await withTimeout(request, timeoutMs)
    if (response.ok && cacheAs !== null) await pages.put(cacheAs, response.clone())
    return response
  } catch (error) {
    const cached = await pages.match(cacheAs ?? request, MATCH)
    if (cached) return cached
    throw error
  }
}

async function cacheFirst(request: Request): Promise<Response> {
  const hashed = await caches.open(HASHED_CACHE)
  const cached = await hashed.match(request, MATCH)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) await hashed.put(request, response.clone())
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, url.pathname === SHELL_PATH ? SHELL_PATH : null, NAVIGATION_TIMEOUT_MS))
  } else if (url.pathname.startsWith(HASHED_FOLDER)) {
    event.respondWith(cacheFirst(request))
  } else {
    event.respondWith(networkFirst(request, url.pathname))
  }
})
