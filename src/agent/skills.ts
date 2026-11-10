/// <reference types="vite/types/importMeta.d.ts" />

const SKILLS_GLOB_PREFIX = '../../claude-plugin/skills/'
export const SKILL_FILE = 'SKILL.md'

export interface SkillFile {
  /** The path inside the skills folder, for example `architecture/SKILL.md`. */
  path: string
  text: string
}

export interface Skill {
  name: string
  description: string
  body: string
  files: SkillFile[]
}

/** Returns the bundled skill files, keyed by their path inside the skills folder. */
export function bundledSkillFiles(): Record<string, string> {
  const files = import.meta.glob<string>('../../claude-plugin/skills/**/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  })
  return Object.fromEntries(Object.entries(files).map(([key, text]) => [key.slice(SKILLS_GLOB_PREFIX.length), text]))
}

/**
 * Reads the YAML front matter of a skill file. It reads only `key: value` lines with plain or quoted values.
 *
 * @returns The values, and the text after the front matter.
 */
export function parseFrontmatter(text: string): { data: Record<string, string>; body: string } {
  const normalized = text.replaceAll('\r\n', '\n')
  if (!normalized.startsWith('---\n')) return { data: {}, body: normalized }
  const end = normalized.indexOf('\n---', 4)
  if (end < 0) return { data: {}, body: normalized }
  const data: Record<string, string> = {}
  for (const line of normalized.slice(4, end).split('\n')) {
    const match = /^([\w-]+):\s*(.*)$/.exec(line)
    if (!match?.[1]) continue
    const value = (match[2] ?? '').trim()
    data[match[1]] = /^(["']).*\1$/.test(value) ? value.slice(1, -1) : value
  }
  return { data, body: normalized.slice(normalized.indexOf('\n', end + 1) + 1) }
}

/** Groups skill files by skill. A skill is a folder with a `SKILL.md` file. */
export function loadSkills(files: Record<string, string>): Skill[] {
  const skills: Skill[] = []
  for (const [path, text] of Object.entries(files)) {
    const folder = path.split('/')[0]
    if (!folder || path !== `${folder}/${SKILL_FILE}`) continue
    const { data, body } = parseFrontmatter(text)
    skills.push({
      name: data.name ?? folder,
      description: data.description ?? '',
      body,
      files: Object.entries(files)
        .filter(([candidate]) => candidate.startsWith(`${folder}/`))
        .map(([candidate, content]) => ({ path: candidate, text: content }))
        .toSorted((a, b) => a.path.localeCompare(b.path)),
    })
  }
  return skills.toSorted((a, b) => a.name.localeCompare(b.name))
}
