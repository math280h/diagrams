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

/** The width of an image in the pull request comment, in pixels. */
export const IMAGE_WIDTH_PX = 420

function cell(url, view, label, note) {
  if (!url) return note
  if (!view) return `<img src="${url}" alt="${label}" width="${IMAGE_WIDTH_PX}">`
  return `<img src="${view}" alt="${label}, part of the image" width="${IMAGE_WIDTH_PX}"><br><a href="${url}">Whole image</a>`
}

/**
 * Writes the pull request comment with the before and after image of each changed diagram.
 *
 * @param intro - The sentence above the table.
 * @param entries - Each changed diagram with the address of its images. Without `before`, the cell shows
 *   `beforeNote`, or `New` for an added diagram. Without `after`, it shows `Removed`. With `beforeView` or
 *   `afterView`, the cell shows that part of a tall image and links the whole image. Without entries, the comment has
 *   no table.
 */
export function commentBody({ entries, intro }) {
  const rows = entries.map(
    ({ file, before, after, beforeView, afterView, beforeNote }) =>
      `| \`${file}\` | ${cell(before, beforeView, 'Before', beforeNote ?? 'New')} | ${cell(after, afterView, 'After', 'Removed')} |`,
  )
  const table = rows.length > 0 ? ['', '| Diagram | Before | After |', '| --- | --- | --- |', ...rows] : []
  return [COMMENT_MARKER, '### Diagram images', '', intro, ...table, ''].join('\n')
}

/** Returns a link to a file on a branch that GitHub shows as an image to the people who can read the repository. */
export function imageUrl({ server, repository, branch, file }) {
  return `${server}/${repository}/blob/${encodeURIComponent(branch)}/${file.split('/').map(encodeURIComponent).join('/')}?raw=true`
}
