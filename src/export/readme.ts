export type ReadmeFormat = 'png' | 'gif'

export interface ReadmeImagePaths {
  dark: string
  light: string
}

/**
 * Returns the paths of the dark and the light image.
 *
 * @param basePath - The path in the repository without the theme and the extension, for example `docs/images/orders`.
 */
export function readmeImagePaths(basePath: string, format: ReadmeFormat): ReadmeImagePaths {
  const base = basePath.trim().replace(/\.(png|gif)$/i, '') || 'diagram'
  return { dark: `${base}-dark.${format}`, light: `${base}-light.${format}` }
}

const ATTRIBUTE_ESCAPES: Record<string, string> = { '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }

function attribute(text: string): string {
  return text.replace(/[&"<>]/g, (character) => ATTRIBUTE_ESCAPES[character]!)
}

/**
 * Writes a `picture` element for Markdown that shows the dark image on a dark page and the light image on all other
 * pages.
 *
 * @param alt - The alt text. It must have no empty line, because an empty line ends an HTML block in Markdown.
 */
export function readmeSnippet(paths: ReadmeImagePaths, alt: string): string {
  return [
    '<picture>',
    `  <source media="(prefers-color-scheme: dark)" srcset="${attribute(encodeURI(paths.dark))}">`,
    `  <img src="${attribute(encodeURI(paths.light))}" alt="${attribute(alt)}">`,
    '</picture>',
    '',
  ].join('\n')
}
