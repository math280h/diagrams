import type { Plugin } from 'vite'
import { OFFICIAL_WEBSITE } from '../src/desktop/build-config.ts'

/** Returns the page with each attribute value that starts with the official website address moved to `website`. */
export function withWebsiteAddress(html: string, website: string): string {
  return html.replaceAll(`"${OFFICIAL_WEBSITE}/`, `"${website}/`)
}

/** Creates a Vite plugin that points the link preview tags of the page at the website of the build. */
export function websiteAddress(website: string): Plugin {
  return {
    name: 'website-address',
    transformIndexHtml: (html) => withWebsiteAddress(html, website),
  }
}
