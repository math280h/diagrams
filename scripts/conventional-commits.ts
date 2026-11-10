/** The types that a commit header can start with. */
export const COMMIT_TYPES = [
  'feat',
  'fix',
  'perf',
  'refactor',
  'docs',
  'test',
  'build',
  'ci',
  'chore',
  'style',
  'revert',
]

const HEADER = /^(?<type>[a-z]+)(?:\((?<scope>[\w./-]+)\))?(?<breaking>!)?: (?<description>\S.*)$/

export interface CommitHeader {
  type: string
  scope: string | null
  breaking: boolean
  description: string
}

/**
 * Returns the parts of a Conventional Commits 1.0.0 header such as `fix(editor)!: keep the toolbar in view`.
 *
 * @returns `null` when the text does not follow the format or starts with a type outside {@link COMMIT_TYPES}.
 */
export function parseHeader(text: string): CommitHeader | null {
  const groups = HEADER.exec(text.trim())?.groups
  if (!groups || !COMMIT_TYPES.includes(groups.type!)) return null
  return {
    type: groups.type!,
    scope: groups.scope ?? null,
    breaking: groups.breaking === '!',
    description: groups.description!.trim(),
  }
}

/** Returns the description of a commit header with a capital first letter, or the text as it is without a header. */
export function headerDescription(text: string): string {
  const header = parseHeader(text)
  if (!header) return text
  return header.description.charAt(0).toUpperCase() + header.description.slice(1)
}

function main() {
  const title = process.env.PULL_REQUEST_TITLE ?? ''
  if (parseHeader(title)) return
  console.error(
    `::error::The title "${title}" is not a Conventional Commits header. Write it as "type(scope): description", ` +
      `for example "fix(editor): keep the flow toolbar in view". Types: ${COMMIT_TYPES.join(', ')}.`,
  )
  process.exit(1)
}

if (import.meta.main) main()
