import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { protocol } from 'electron'

export const APP_SCHEME = 'app'
export const APP_HOST = 'diagrams'
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
}

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ')

/**
 * Returns the scheme, host and port of a URL.
 *
 * @returns The origin, also for the app scheme, for which `URL.origin` is the string "null" in Node.
 */
export function originOf(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    return ''
  }
}

/** Registers the app scheme as a secure standard scheme. Call it before the app is ready. */
export function registerAppScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
        codeCache: true,
      },
    },
  ])
}

/**
 * Resolves an app URL to a file inside the renderer folder.
 *
 * @returns The absolute file path, or `null` for another host or a path outside the folder.
 */
export function resolveAppFile(url: string, rootDir: string): string | null {
  const parsed = new URL(url)
  if (parsed.protocol !== `${APP_SCHEME}:` || parsed.host !== APP_HOST) return null
  const relative = decodeURIComponent(parsed.pathname)
  const file = path.resolve(rootDir, `.${relative === '/' ? '/index.html' : relative}`)
  const root = path.resolve(rootDir)
  return file.startsWith(root + path.sep) ? file : null
}

export function serveRenderer(rootDir: string) {
  protocol.handle(APP_SCHEME, async (request) => {
    const file = resolveAppFile(request.url, rootDir)
    if (!file) return new Response('Not found', { status: 404 })
    try {
      const body = await readFile(file)
      return new Response(body, {
        headers: {
          'content-type': MIME_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
          'content-security-policy': CONTENT_SECURITY_POLICY,
        },
      })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}
