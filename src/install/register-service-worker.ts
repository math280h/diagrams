import { CACHE_ALL_MESSAGE, SERVICE_WORKER_PATH } from '@/sw/asset-list'
import { runsAsInstalledApp } from './install-prompt'

function savesData(): boolean {
  return (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true
}

function cacheAllWhenInstalled(worker: ServiceWorker | null) {
  if (!worker) return
  if (worker.state !== 'installing') {
    worker.postMessage(CACHE_ALL_MESSAGE, [])
    return
  }
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed') worker.postMessage(CACHE_ALL_MESSAGE, [])
  })
}

/**
 * Makes the installed app work without internet. It registers the service worker and asks it to fetch every file,
 * unless the browser saves data. A browser tab gets no service worker.
 *
 * A new worker of a new version also fetches every file of its build while it waits for the open pages to close.
 */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !runsAsInstalledApp()) return
  navigator.serviceWorker.register(SERVICE_WORKER_PATH).catch(() => undefined)
  if (savesData()) return
  void navigator.serviceWorker.ready.then((registration) => {
    registration.active?.postMessage(CACHE_ALL_MESSAGE)
    cacheAllWhenInstalled(registration.waiting)
    cacheAllWhenInstalled(registration.installing)
    registration.addEventListener('updatefound', () => cacheAllWhenInstalled(registration.installing))
  })
}
