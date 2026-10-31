export type ContentSecurityPolicy = Readonly<Record<string, readonly string[]>>

/** The sources that the renderer of the desktop app can load, by directive. */
export const RENDERER_POLICY: ContentSecurityPolicy = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'font-src': ["'self'", 'data:'],
  'connect-src': ["'self'", 'data:', 'blob:'],
  'worker-src': ["'self'", 'blob:'],
  'media-src': ["'self'", 'blob:'],
  'object-src': ["'none'"],
  'base-uri': ["'none'"],
  'frame-ancestors': ["'none'"],
}

/** Returns the policy as the value of a `Content-Security-Policy` header or meta element. */
export function policyText(policy: ContentSecurityPolicy): string {
  return Object.entries(policy)
    .map(([directive, sources]) => [directive, ...sources].join(' '))
    .join('; ')
}
