/// <reference types="vite/types/importMeta.d.ts" />
import type { ViteMCP, ViteMCPAuth } from '@vitemcp/server'
import { AGENT_INSTRUCTIONS } from '@/agent/instructions'
import { SKILL_FILE, type Skill } from '@/agent/skills'

export { bundledSkillFiles, loadSkills, parseFrontmatter, type Skill, type SkillFile } from '@/agent/skills'

const SKILL_URI_PREFIX = 'skill://diagrams/'

export function bundledPluginConfig(): { manifest: string; mcpConfig: string } {
  const manifest = import.meta.glob<string>('../../claude-plugin/.claude-plugin/plugin.json', {
    query: '?raw',
    import: 'default',
    eager: true,
  })
  const mcpConfig = import.meta.glob<string>('../../claude-plugin/.mcp.json', {
    query: '?raw',
    import: 'default',
    eager: true,
  })
  return { manifest: Object.values(manifest)[0] ?? '{}', mcpConfig: Object.values(mcpConfig)[0] ?? '{}' }
}

function skillUri(path: string) {
  return `${SKILL_URI_PREFIX}${path}`
}

/** Returns the server instructions: the base rules, then a pointer to each skill. */
export function buildInstructions(skills: readonly Skill[]): string {
  const list = skills.map((skill) => `- ${skillUri(`${skill.name}/${SKILL_FILE}`)}: ${skill.description}`)
  return `${AGENT_INSTRUCTIONS}

Skills give step-by-step guidance. Before a larger task, read the matching skill with your MCP resource tool:
${list.join('\n')}`
}

const SKILL_PROMPTS = [
  {
    name: 'draw-architecture',
    skill: 'architecture',
    description: 'Draw or extend an architecture diagram in the Diagrams app.',
    argument: 'request',
    argumentDescription: 'What to draw, for example "a checkout with Stripe, Postgres and a worker queue".',
    required: true,
  },
  {
    name: 'animate-flow',
    skill: 'flows',
    description: 'Add an animated flow that plays a request through the open diagram.',
    argument: 'request',
    argumentDescription: 'The path to show, for example "an order from the browser to the confirmation email".',
    required: true,
  },
  {
    name: 'diagram-from-code',
    skill: 'infrastructure',
    description: 'Draw a diagram from Terraform, docker-compose or Kubernetes files, or check a diagram against them.',
    argument: 'request',
    argumentDescription:
      'What to do, for example "draw the infra folder as a diagram" or "check the open diagram against k8s/".',
    required: true,
  },
  {
    name: 'threat-model',
    skill: 'threat-model',
    description: 'Mark the sensitive data in the open diagram and check each trust boundary crossing with STRIDE.',
    argument: 'focus',
    argumentDescription: 'What to look at most, for example "the payment calls". Leave it empty to check everything.',
    required: false,
  },
  {
    name: 'review-diagram',
    skill: 'review',
    description: 'Review the open diagram and fix layout and clarity problems.',
    argument: 'focus',
    argumentDescription: 'What to look at most, for example "the edges". Leave it empty to check everything.',
    required: false,
  },
] as const

const DEFAULT_REVIEW_TASK = 'Review the open diagram.'

function promptText(skill: Skill, task: string) {
  const extra = skill.files.filter((file) => !file.path.endsWith(`/${SKILL_FILE}`)).map((file) => skillUri(file.path))
  const files = extra.length > 0 ? `\n\nFiles of this skill, readable as MCP resources: ${extra.join(', ')}` : ''
  return `${skill.body.trim()}${files}\n\nTask: ${task}`
}

/** Adds the skill files as `skill://` resources and the skill workflows as prompts. */
export function registerSkills<T extends ViteMCPAuth>(server: ViteMCP<T>, skills: readonly Skill[]) {
  for (const skill of skills) {
    for (const file of skill.files) {
      const main = file.path === `${skill.name}/${SKILL_FILE}`
      server.addResource({
        uri: skillUri(file.path),
        name: main ? skill.name : file.path,
        description: main ? skill.description : `A reference file of the ${skill.name} skill.`,
        mimeType: 'text/markdown',
        load: async () => ({ text: file.text }),
      })
    }
  }
  for (const prompt of SKILL_PROMPTS) {
    const skill = skills.find((candidate) => candidate.name === prompt.skill)
    if (!skill) continue
    server.addPrompt({
      name: prompt.name,
      description: prompt.description,
      arguments: [{ name: prompt.argument, description: prompt.argumentDescription, required: prompt.required }],
      load: async (args) => ({
        messages: [
          {
            role: 'user',
            content: { type: 'text', text: promptText(skill, args[prompt.argument] || DEFAULT_REVIEW_TASK) },
          },
        ],
      }),
    })
  }
}
