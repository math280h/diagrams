import { BUILD, OFFICIAL_WEBSITE } from '@/desktop/build-config'
import { DIAGRAM_VERSION, type Diagram } from '@/model/schema'

/** The oldest diagram format with a JSON Schema on the website. */
export const FIRST_PUBLISHED_FORMAT = 21

const SCHEMA_PATH = /^\/schemas\/diagram-v\d+\.json$/
const OWN_WEBSITES: readonly string[] = [...new Set([BUILD.website, OFFICIAL_WEBSITE])]

/** Returns the path of the JSON Schema of a diagram format from the site root, for example `/schemas/diagram-v21.json`. */
export function diagramSchemaPath(version: number): string {
  return `/schemas/diagram-v${version}.json`
}

/** The address of the JSON Schema of the current diagram format, on the website of this build. */
export const DIAGRAM_SCHEMA_URL = `${BUILD.website}${diagramSchemaPath(DIAGRAM_VERSION)}`

function isOwnSchemaAddress(address: string): boolean {
  return OWN_WEBSITES.some((website) => address.startsWith(website) && SCHEMA_PATH.test(address.slice(website.length)))
}

/** Returns a diagram as a diagram file holds it: with `$schema` first, and the current format address if it has none. */
export function withSchemaAddress(diagram: Diagram): Diagram {
  const { $schema, ...content } = diagram
  return { $schema: $schema ?? DIAGRAM_SCHEMA_URL, ...content }
}

/**
 * Returns the diagram without its `$schema`, if that is the JSON Schema of a diagram format, of any version, on the
 * website of this build or on the official website.
 */
export function withoutOwnSchemaAddress(diagram: Diagram): Diagram {
  if (diagram.$schema === undefined || !isOwnSchemaAddress(diagram.$schema)) return diagram
  const { $schema: _schema, ...content } = diagram
  return content
}
