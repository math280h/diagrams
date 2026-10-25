import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { TOOL_DEFINITIONS } from '@/agent/tool-definitions'
import { marketplaceFiles, writeMarketplace } from './marketplace'
import { buildInstructions, bundledPluginConfig, bundledSkillFiles, loadSkills, parseFrontmatter } from './skills'

const files = bundledSkillFiles()
const skills = loadSkills(files)
const SKILL_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/
const MAX_DESCRIPTION = 1024
/** The maximum length of server instructions that Claude Code shows, less a margin. */
const MAX_INSTRUCTIONS = 4000
const TOOL_WORD = /\b[a-z]+(?:_[a-z]+)+\b/g
const MARKDOWN_LINK = /\]\(([^)#\s]+)\)/g
const ICON_NAME = /`((?:aws|azure|gcp|k8s|logo):[\w.-]+)`/g

describe('skills', () => {
  it('bundles the three skills', () => {
    expect(skills.map((skill) => skill.name)).toEqual(['architecture', 'flows', 'review'])
  })

  it('names each skill like its folder and describes it', () => {
    for (const skill of skills) {
      expect(skill.name).toMatch(SKILL_NAME)
      expect(skill.files.some((file) => file.path === `${skill.name}/SKILL.md`)).toBe(true)
      expect(skill.description.length).toBeGreaterThan(40)
      expect(skill.description.length).toBeLessThanOrEqual(MAX_DESCRIPTION)
    }
  })

  it('links only to files that exist', () => {
    for (const [file, text] of Object.entries(files)) {
      for (const [, target] of text.matchAll(MARKDOWN_LINK)) {
        expect(files, `${file} links to ${target}`).toHaveProperty(path.posix.join(path.posix.dirname(file), target!))
      }
    }
  })

  it('names only tools that exist', () => {
    const texts = [...Object.values(files), buildInstructions(skills)]
    for (const text of texts) {
      for (const [word] of text.matchAll(TOOL_WORD)) expect(TOOL_DEFINITIONS, word).toHaveProperty(word)
    }
  })

  it('names only set icons that exist', () => {
    const folder = path.join(import.meta.dirname, '../../src/canvas/icons/data')
    const ids = new Set(
      readdirSync(folder).flatMap((name) => {
        const data = JSON.parse(readFileSync(path.join(folder, name), 'utf8')) as { entries: { id: string }[] }
        return data.entries.map((entry) => entry.id)
      }),
    )
    for (const text of Object.values(files)) {
      for (const [, icon] of text.matchAll(ICON_NAME)) expect(ids.has(icon!), icon).toBe(true)
    }
  })

  it('keeps the server instructions short enough for Claude Code', () => {
    const instructions = buildInstructions(skills)
    expect(instructions.length).toBeLessThanOrEqual(MAX_INSTRUCTIONS)
    expect(instructions).toContain('skill://diagrams/architecture/SKILL.md')
  })

  it('reads front matter with quoted values', () => {
    expect(parseFrontmatter('---\nname: x\ndescription: "a: b"\n---\nBody\n')).toEqual({
      data: { name: 'x', description: 'a: b' },
      body: 'Body\n',
    })
  })
})

describe('marketplace', () => {
  const plugin = bundledPluginConfig()
  const marketplace = marketplaceFiles({ version: '2.4.0', port: 30_000, ...plugin, skills })

  it('pins the plugin to the app version and the agent port', () => {
    const manifest = JSON.parse(marketplace.get('plugin/.claude-plugin/plugin.json')!) as Record<string, unknown>
    expect(manifest).toMatchObject({ name: 'diagrams', version: '2.4.0' })
    expect(manifest.userConfig).toHaveProperty('diagrams_token.sensitive', true)
    expect(marketplace.get('plugin/.mcp.json')).toContain('http://127.0.0.1:30000/mcp')
    expect(marketplace.get('plugin/.mcp.json')).toContain('${user_config.diagrams_token}')
    const catalog = JSON.parse(marketplace.get('.claude-plugin/marketplace.json')!) as { plugins: { source: string }[] }
    expect(catalog.plugins[0]?.source).toBe('./plugin')
  })

  it('copies every skill file without changes', () => {
    for (const [file, text] of Object.entries(files)) expect(marketplace.get(`plugin/skills/${file}`)).toBe(text)
  })

  it('writes the files and removes skill files the app no longer has', async () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'marketplace-'))
    try {
      mkdirSync(path.join(folder, 'plugin/skills/old'), { recursive: true })
      writeFileSync(path.join(folder, 'plugin/skills/old/SKILL.md'), 'old')
      await writeMarketplace(folder, marketplace)
      expect(readFileSync(path.join(folder, 'plugin/skills/flows/SKILL.md'), 'utf8')).toBe(files['flows/SKILL.md'])
      expect(readdirSync(path.join(folder, 'plugin/skills/old'))).toEqual([])
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })
})
