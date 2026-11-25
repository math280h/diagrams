/** An error for a file of the app that did not load, such as the script of a worker, an icon set or a font. */
export class FileLoadError extends Error {
  override name = 'FileLoadError'
}

// Chromium, Firefox and Safari start the message of a failed dynamic import with one of the first three texts. Vite
// starts the message of a failed style sheet of a chunk with the last one.
const MODULE_LOAD_MESSAGES = [
  'Failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'Importing a module script failed',
  'Unable to preload CSS for',
]

/** Returns true for a {@link FileLoadError} and for an error of a script or style sheet that did not load. */
export function isFileLoadError(error: unknown): boolean {
  if (error instanceof FileLoadError) return true
  return error instanceof Error && MODULE_LOAD_MESSAGES.some((start) => error.message.startsWith(start))
}

const listeners = new Set<(error: FileLoadError) => void>()

/**
 * Calls the listener for each file of the app that did not load and that no code reports to the user.
 *
 * @returns A function that removes the listener.
 */
export function onFileLoadFailure(listener: (error: FileLoadError) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Tells the listeners of {@link onFileLoadFailure} about a file that did not load. */
export function fileLoadFailed(error: FileLoadError) {
  for (const listener of listeners) listener(error)
}

function fileName(url: string): string {
  return url.slice(url.lastIndexOf('/') + 1)
}

/**
 * Fetches a file of this build, such as an icon set or a font.
 *
 * Some servers send the page for a file that they do not have. Such an answer counts as a missing file.
 *
 * @throws FileLoadError If the server does not send the file. The error also goes to {@link fileLoadFailed}.
 */
export async function fetchAppFile(url: string): Promise<Response> {
  const response = await fetch(url)
  if (response.ok && !response.headers.get('content-type')?.includes('text/html')) return response
  const error = new FileLoadError(`The file ${fileName(url)} did not load (status ${response.status}).`)
  fileLoadFailed(error)
  throw error
}

/**
 * Returns the error for a failure message that a worker sent.
 *
 * @param fileMissing - True if the worker knows that a file did not load.
 * @returns A {@link FileLoadError} for a file that did not load. The error then also goes to {@link fileLoadFailed}.
 */
export function workerReplyError(message: string, fileMissing = false): Error {
  const error = new Error(message)
  if (!fileMissing && !isFileLoadError(error)) return error
  const missing = new FileLoadError(message)
  fileLoadFailed(missing)
  return missing
}

/**
 * Returns the error for an `error` event of a worker.
 *
 * @param stopped - The message for an error in the script of the worker, when the event has no message.
 * @param notLoaded - The message when the script of the worker did not load.
 * @returns A {@link FileLoadError} when the script did not load. The error then also goes to {@link fileLoadFailed}.
 */
export function workerError(event: Event, stopped: string, notLoaded: string): Error {
  // Browsers fire an ErrorEvent for an error in the worker, and a plain Event when its script does not load.
  if (typeof ErrorEvent !== 'undefined' && event instanceof ErrorEvent) return new Error(event.message || stopped)
  const error = new FileLoadError(notLoaded)
  fileLoadFailed(error)
  return error
}
