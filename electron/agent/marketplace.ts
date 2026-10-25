import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { AGENT_PORT, CLAUDE_MARKETPLACE_NAME, CLAUDE_PLUGIN_NAME } from '@/desktop/constants'
import type { Skill } from './skills'

const PLUGIN_FOLDER = 'plugin'
const SKILLS_FOLDER = `${PLUGIN_FOLDER}/skills`

/**
 * Returns the files of a local Claude Code marketplace that holds the plugin of this app version.
 *
 * @returns The file contents, keyed by their path inside the marketplace folder.
 */
export function marketplaceFiles(options: {
  version: string
  port: number
  manifest: string
  mcpConfig: string
  skills: readonly Skill[]
}): Map<string, string> {
  const manifest: Record<string, unknown> = { ...(JSON.parse(options.manifest) as object), version: options.version }
  const files = new Map<string, string>()
  const marketplace = {
    name: CLAUDE_MARKETPLACE_NAME,
    owner: { name: 'Diagrams' },
    description: 'The skills and the MCP server of the Diagrams desktop app.',
    plugins: [{ name: CLAUDE_PLUGIN_NAME, source: `./${PLUGIN_FOLDER}`, description: manifest.description }],
  }
  files.set('.claude-plugin/marketplace.json', `${JSON.stringify(marketplace, null, 2)}\n`)
  files.set(`${PLUGIN_FOLDER}/.claude-plugin/plugin.json`, `${JSON.stringify(manifest, null, 2)}\n`)
  files.set(`${PLUGIN_FOLDER}/.mcp.json`, options.mcpConfig.replaceAll(`:${AGENT_PORT}/`, `:${options.port}/`))
  for (const skill of options.skills) {
    for (const file of skill.files) files.set(`${SKILLS_FOLDER}/${file.path}`, file.text)
  }
  return files
}

async function listFiles(folder: string, prefix: string): Promise<string[]> {
  let entries
  try {
    entries = await readdir(path.join(folder, prefix), { withFileTypes: true })
  } catch {
    return []
  }
  const nested = await Promise.all(
    entries.map((entry) => {
      const relative = `${prefix}/${entry.name}`
      return entry.isDirectory() ? listFiles(folder, relative) : Promise.resolve([relative])
    }),
  )
  return nested.flat()
}

/** Writes the marketplace files that changed and removes skill files that the app no longer has. */
export async function writeMarketplace(folder: string, files: ReadonlyMap<string, string>) {
  for (const [relative, text] of files) {
    const target = path.join(folder, relative)
    const current = await readFile(target, 'utf8').catch(() => null)
    if (current === text) continue
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, text, 'utf8')
  }
  for (const relative of await listFiles(folder, SKILLS_FOLDER)) {
    if (!files.has(relative)) await rm(path.join(folder, relative), { force: true })
  }
}
