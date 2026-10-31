import type { Plugin } from 'vite'
import { type ContentSecurityPolicy, policyText, RENDERER_POLICY } from '../src/content-security-policy.ts'
import { AGENT_HOST, AGENT_PORT, REPOSITORY_API_URL } from '../src/desktop/constants.ts'

/**
 * Returns the policy of the website: the renderer policy of the desktop app, and the connections that only the website
 * makes (the GitHub API and the handoff to the desktop app).
 */
export function websitePolicy(): ContentSecurityPolicy {
  // Browsers ignore frame-ancestors in a meta element and log a warning.
  const { 'frame-ancestors': _frameAncestors, ...policy } = RENDERER_POLICY
  return {
    ...policy,
    'connect-src': [
      ...(policy['connect-src'] ?? []),
      new URL(REPOSITORY_API_URL).origin,
      `http://${AGENT_HOST}:${AGENT_PORT}`,
    ],
  }
}

/** Creates a Vite plugin that puts the website policy in a meta element at the start of the page of a build. */
export function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: policyText(websitePolicy()) },
        injectTo: 'head-prepend',
      },
    ],
  }
}
