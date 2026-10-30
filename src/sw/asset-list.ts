/** The files of one website build that the service worker keeps. Each entry is a path from the site root. */
export interface AssetList {
  /** The page and the public files, fetched when the service worker installs. */
  shell: string[]
  /** The files with a content hash that open the library, the editor and Present, fetched at install. */
  precache: string[]
  /** Every file of the build except the page itself, which the installed app fetches in the background. */
  all: string[]
}

/** The message that asks the service worker to fetch every file of the build. */
export const CACHE_ALL_MESSAGE = 'cache-all'

/** The folder of the files with a content hash in their name. Such a file never changes. */
export const HASHED_FOLDER = '/assets/'

export const SERVICE_WORKER_PATH = '/sw.js'
