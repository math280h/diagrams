export const COMMENT_MARKER = '<!-- diagrams-render -->'

/** Splits the `files` input into glob patterns, one for each line. */
export function parsePatterns(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

/** Returns the git pathspecs that match the glob patterns, with `**` for any number of folders. */
export function pathspecs(patterns) {
  return patterns.map((pattern) => `:(glob)${pattern}`)
}

/** Returns the image path next to a diagram file: `docs/orders.diagram.json` gives `docs/orders.png`. */
export function imagePath(file, format) {
  return `${file.replace(/(\.diagram)?\.json$/i, '')}.${format}`
}

/** Splits a command such as `node_modules/.bin/electron .` into the program and its arguments. */
export function splitCommand(text) {
  return text.trim().split(/\s+/).filter(Boolean)
}

/**
 * Reads the output of `git diff --name-status --no-renames`.
 *
 * @returns The added, changed and removed files. A type change counts as a change.
 */
export function parseNameStatus(text) {
  const kinds = { A: 'added', M: 'changed', T: 'changed', D: 'removed' }
  return text
    .split('\n')
    .map((line) => line.split('\t'))
    .filter(([status, file]) => file && kinds[status?.[0]])
    .map(([status, file]) => ({ kind: kinds[status[0]], file }))
}

/** Returns the command-line options of the Diagrams app for one render. */
export function renderOptions({ input, output, theme, maxSize }) {
  return [
    '--render',
    input,
    '--out',
    output,
    ...(theme ? ['--theme', theme] : []),
    ...(maxSize ? ['--max-size', maxSize] : []),
  ]
}

function cell(url, label, note) {
  return url ? `<img src="${url}" alt="${label}" width="420">` : note
}

/**
 * Writes the pull request comment with the before and after image of each changed diagram.
 *
 * @param intro - The sentence above the table.
 * @param entries - Each changed diagram with the address of its images. Without `before`, the cell shows
 *   `beforeNote`, or `New` for an added diagram. Without `after`, it shows `Removed`. Without entries, the comment has
 *   no table.
 */
export function commentBody({ entries, intro }) {
  const rows = entries.map(
    ({ file, before, after, beforeNote }) =>
      `| \`${file}\` | ${cell(before, 'Before', beforeNote ?? 'New')} | ${cell(after, 'After', 'Removed')} |`,
  )
  const table = rows.length > 0 ? ['', '| Diagram | Before | After |', '| --- | --- | --- |', ...rows] : []
  return [COMMENT_MARKER, '### Diagram images', '', intro, ...table, ''].join('\n')
}

/** Returns a link to a file on a branch that GitHub shows as an image to the people who can read the repository. */
export function imageUrl({ server, repository, branch, file }) {
  return `${server}/${repository}/blob/${encodeURIComponent(branch)}/${file.split('/').map(encodeURIComponent).join('/')}?raw=true`
}
