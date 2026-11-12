import type { Plugin } from 'vite'
import { type ContentSecurityPolicy, policyText, RENDERER_POLICY } from '../src/content-security-policy.ts'
import { AGENT_HOST, AGENT_PORTS, GITHUB_API_ORIGIN } from '../src/desktop/constants.ts'

/**
 * Returns the policy of the website. It holds the renderer policy of the desktop app and the connections that only the
 * website makes. These connections go to the GitHub API, to the desktop app for the handoff, and to the report server
 * of the build.
 *
 * @param reportUrl - The base address of the report server of the build, or `null` for a build without one.
 */
export function websitePolicy(reportUrl: string | null = null): ContentSecurityPolicy {
  // Browsers ignore frame-ancestors in a meta element and log a warning.
  const { 'frame-ancestors': _frameAncestors, ...policy } = RENDERER_POLICY
  return {
    ...policy,
    'connect-src': [
      ...(policy['connect-src'] ?? []),
      GITHUB_API_ORIGIN,
      ...AGENT_PORTS.map((port) => `http://${AGENT_HOST}:${port}`),
      ...(reportUrl === null ? [] : [new URL(reportUrl).origin]),
    ],
  }
}

/**
 * Creates a Vite plugin that puts the website policy in a meta element at the start of the page of a build.
 *
 * @param reportUrl - The base address of the report server of the build, or `null` for a build without one.
 */
export function contentSecurityPolicy(reportUrl: string | null = null): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: policyText(websitePolicy(reportUrl)) },
        injectTo: 'head-prepend',
      },
    ],
  }
}
