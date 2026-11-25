import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FileLoadError,
  fetchAppFile,
  isFileLoadError,
  onFileLoadFailure,
  workerError,
  workerReplyError,
} from './file-load'

const failures: FileLoadError[] = []
let stopListening: () => void = () => undefined

beforeEach(() => {
  failures.length = 0
  stopListening = onFileLoadFailure((error) => failures.push(error))
})

afterEach(() => {
  stopListening()
  vi.unstubAllGlobals()
})

describe('isFileLoadError', () => {
  it('knows the failed imports of Chromium, Firefox and Safari and the failed style sheets of Vite', () => {
    for (const message of [
      'Failed to fetch dynamically imported module: https://draw.example/assets/diagram-layout-x1.js',
      'error loading dynamically imported module: https://draw.example/assets/diagram-layout-x1.js',
      'Importing a module script failed.',
      'Unable to preload CSS for /assets/EditorPage-x1.css',
    ]) {
      expect(isFileLoadError(new TypeError(message))).toBe(true)
    }
    expect(isFileLoadError(new FileLoadError('The layout worker did not load.'))).toBe(true)
  })

  it('leaves other failures alone', () => {
    expect(isFileLoadError(new Error('Tidy up failed.'))).toBe(false)
    expect(isFileLoadError(new TypeError('Failed to fetch'))).toBe(false)
    expect(isFileLoadError('Failed to fetch dynamically imported module')).toBe(false)
    expect(isFileLoadError(null)).toBe(false)
  })
})

describe('fetchAppFile', () => {
  function serve(response: Response) {
    const fetch = vi.fn(async () => response)
    vi.stubGlobal('fetch', fetch)
    return fetch
  }

  it('returns the file that the server sends', async () => {
    serve(new Response('{"entries":[]}', { headers: { 'content-type': 'application/json' } }))
    await expect((await fetchAppFile('/assets/aws-x1.json')).json()).resolves.toEqual({ entries: [] })
    expect(failures).toEqual([])
  })

  it('reports a file that the server does not have', async () => {
    serve(new Response('Not found', { status: 404, headers: { 'content-type': 'text/html' } }))
    const error = await fetchAppFile('/assets/aws-x1.json').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(FileLoadError)
    expect((error as Error).message).toBe('The file aws-x1.json did not load (status 404).')
    expect(failures).toEqual([error])
  })

  it('reports the page that a server sends in place of a missing file', async () => {
    serve(new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }))
    await expect(fetchAppFile('/assets/inter-x1.woff2')).rejects.toBeInstanceOf(FileLoadError)
    expect(failures).toHaveLength(1)
  })

  it('lets a failed connection fail as it is', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    await expect(fetchAppFile('/assets/aws-x1.json')).rejects.toThrow('Failed to fetch')
    expect(failures).toEqual([])
  })
})

describe('workerError', () => {
  class FakeErrorEvent extends Event {
    readonly message: string
    constructor(message: string) {
      super('error')
      this.message = message
    }
  }

  it('reports a worker whose script did not load', () => {
    const error = workerError(new Event('error'), 'The layout worker stopped.', 'The layout worker did not load.')
    expect(error).toBeInstanceOf(FileLoadError)
    expect(error.message).toBe('The layout worker did not load.')
    expect(failures).toEqual([error])
  })

  it('keeps the message of an error in the worker', () => {
    vi.stubGlobal('ErrorEvent', FakeErrorEvent)
    const stopped = 'The layout worker stopped.'
    expect(workerError(new FakeErrorEvent('Out of memory'), stopped, 'not loaded').message).toBe('Out of memory')
    expect(workerError(new FakeErrorEvent(''), stopped, 'not loaded').message).toBe(stopped)
    expect(failures).toEqual([])
  })
})

describe('workerReplyError', () => {
  it('reports a reply about a file that did not load', () => {
    const imported = workerReplyError('Failed to fetch dynamically imported module: /assets/dist-x1.js')
    const known = workerReplyError('The ELK worker did not load.', true)
    expect(imported).toBeInstanceOf(FileLoadError)
    expect(known).toBeInstanceOf(FileLoadError)
    expect(failures).toEqual([imported, known])
  })

  it('keeps other replies as plain errors', () => {
    const error = workerReplyError('The graph has a cycle.')
    expect(error).not.toBeInstanceOf(FileLoadError)
    expect(error.message).toBe('The graph has a cycle.')
    expect(failures).toEqual([])
  })
})
