import { CACHE_ALL_MESSAGE, SERVICE_WORKER_PATH } from '@/sw/asset-list'
import { runsAsInstalledApp } from './install-prompt'

function savesData(): boolean {
  return (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true
}

/**
 * Makes the installed app work without internet. It registers the service worker and asks it to fetch every file,
 * unless the browser saves data. A browser tab gets no service worker.
 */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !runsAsInstalledApp()) return
  navigator.serviceWorker.register(SERVICE_WORKER_PATH).catch(() => undefined)
  if (savesData()) return
  void navigator.serviceWorker.ready.then((registration) => registration.active?.postMessage(CACHE_ALL_MESSAGE))
}
