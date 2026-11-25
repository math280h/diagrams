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

/**
 * Returns the image path next to a diagram file: `docs/orders.diagram.json` gives `docs/orders.png`. With a theme, the
 * name holds the theme: `docs/orders.dark.png`, or `docs/orders.brand.png` for the theme file `themes/brand.theme.json`.
 */
export function imagePath(file, format, theme) {
  const name = file.replace(/(\.diagram)?\.json$/i, '')
  if (!theme) return `${name}.${format}`
  return `${name}.${theme.replace(/^.*[\\/]/, '').replace(/(\.theme)?\.json$/i, '')}.${format}`
}

/** Splits the `theme` input into themes, at spaces, commas and line breaks. */
export function parseThemes(text) {
  return text.split(/[\s,]+/).filter(Boolean)
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

function cell(url, view, hidden, label, note) {
  if (!url) return note
  if (!view) return `<img src="${url}" alt="${label}" width="${IMAGE_WIDTH_PX}">`
  const more = hidden > 0 ? `, ${hidden} more ${hidden === 1 ? 'change' : 'changes'}` : ''
  return `<img src="${view}" alt="${label}, part of the image" width="${IMAGE_WIDTH_PX}"><br><a href="${url}">Whole image${more}</a>`
}

/**
 * Writes the pull request comment with the before and after image of each changed diagram.
 *
 * @param intro - The sentence above the table.
 * @param entries - Each changed diagram with the address of its images. Without `before`, the cell shows
 *   `beforeNote`, or `New` for an added diagram. Without `after`, it shows `Removed`. With `beforeView` or
 *   `afterView`, the cell shows that part of a tall image and links the whole image, with the number of changes
 *   outside the part (`beforeHidden`, `afterHidden`). Without entries, the comment has no table.
 */
export function commentBody({ entries, intro }) {
  const rows = entries.map(
    ({ file, before, after, beforeView, afterView, beforeHidden, afterHidden, beforeNote }) =>
      `| \`${file}\` | ${cell(before, beforeView, beforeHidden, 'Before', beforeNote ?? 'New')} | ${cell(after, afterView, afterHidden, 'After', 'Removed')} |`,
  )
  const table = rows.length > 0 ? ['', '| Diagram | Before | After |', '| --- | --- | --- |', ...rows] : []
  return [COMMENT_MARKER, '### Diagram images', '', intro, ...table, ''].join('\n')
}

const VERSION_TAG = /^v(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/
const COMMIT_SHA = /^[0-9a-f]{40}$/i

/** Reads a version tag such as `v1.2.3` or `v1.2.3-beta.1`, or returns null for another tag. */
export function parseVersion(tag) {
  const match = VERSION_TAG.exec(tag)
  if (!match) return null
  const [, major, minor, patch, prerelease] = match
  return { core: [Number(major), Number(minor), Number(patch)], prerelease: prerelease?.split('.') ?? [] }
}

function compareIdentifiers(a, b) {
  const numbers = [a, b].map((identifier) => (/^\d+$/.test(identifier) ? Number(identifier) : null))
  if (numbers[0] !== null && numbers[1] !== null) return numbers[0] - numbers[1]
  if (numbers[0] !== null) return -1
  if (numbers[1] !== null) return 1
  return a < b ? -1 : a > b ? 1 : 0
}

/** Compares two version tags in the order of semantic versioning, for `toSorted`: a release comes after its previews. */
export function compareVersions(a, b) {
  const [left, right] = [parseVersion(a), parseVersion(b)]
  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] !== right.core[index]) return left.core[index] - right.core[index]
  }
  if (left.prerelease.length === 0 || right.prerelease.length === 0)
    return right.prerelease.length - left.prerelease.length
  for (let index = 0; index < Math.min(left.prerelease.length, right.prerelease.length); index += 1) {
    const order = compareIdentifiers(left.prerelease[index], right.prerelease[index])
    if (order !== 0) return order
  }
  return left.prerelease.length - right.prerelease.length
}

/**
 * Reads the output of `git ls-remote`.
 *
 * @returns The commit of each ref. An annotated tag gives the commit that it points at, not the tag object.
 */
export function parseRefs(text) {
  const refs = new Map()
  for (const line of text.split('\n')) {
    const [sha, name] = line.trim().split('\t')
    if (!sha || !name) continue
    if (name.endsWith('^{}')) refs.set(name.slice(0, -3), sha)
    else if (!refs.has(name)) refs.set(name, sha)
  }
  return refs
}

/**
 * Chooses the Diagrams release that matches the ref of the action.
 *
 * @param ref - The ref of the action in `uses:`: a tag, a branch or a full commit SHA.
 * @param refs - The commit of each tag and branch of the app repository, from {@link parseRefs}.
 * @param published - The tags of the published releases.
 * @returns `version` if a published release has its tag at the commit of the ref. A release comes before a preview at
 *   the same commit. Otherwise `commit` and `candidates`, the stable releases from newest to oldest: the first one that
 *   the commit contains matches. `error` if the ref is unknown, or if it is a version tag or a commit with version tags
 *   that have no published release.
 */
export function releaseForRef({ ref, refs, published }) {
  const isSha = COMMIT_SHA.test(ref)
  const commit = isSha ? ref.toLowerCase() : (refs.get(`refs/tags/${ref}`) ?? refs.get(`refs/heads/${ref}`))
  if (!commit)
    return { error: `The action ref ${ref} is not a tag, branch or commit of Diagrams. Set the version input.` }
  const tagsAtCommit = parseVersion(ref)
    ? [ref]
    : [...refs]
        .filter(([name, sha]) => sha === commit && name.startsWith('refs/tags/'))
        .map(([name]) => name.slice('refs/tags/'.length))
        .filter((tag) => parseVersion(tag))
  const releases = tagsAtCommit
    .filter((tag) => published.includes(tag))
    .toSorted((a, b) => {
      const stable = [a, b].map((tag) => (parseVersion(tag).prerelease.length === 0 ? 1 : 0))
      return stable[0] - stable[1] || compareVersions(a, b)
    })
  if (releases.length > 0) return { version: releases.at(-1) }
  const isBranch = !isSha && !refs.has(`refs/tags/${ref}`)
  if (tagsAtCommit.length > 0 && !isBranch) {
    const newest = tagsAtCommit.toSorted(compareVersions).at(-1)
    return {
      error: `Diagrams ${newest} has no published release yet. Run the job again after the release, or set the version input.`,
    }
  }
  const candidates = published
    .filter((tag) => parseVersion(tag)?.prerelease.length === 0)
    .toSorted(compareVersions)
    .toReversed()
  if (candidates.length === 0) return { error: 'Diagrams has no published release. Set the version input.' }
  return { commit, candidates }
}

/** Returns a link to a file on a branch that GitHub shows as an image to the people who can read the repository. */
export function imageUrl({ server, repository, branch, file }) {
  return `${server}/${repository}/blob/${encodeURIComponent(branch)}/${file.split('/').map(encodeURIComponent).join('/')}?raw=true`
}
