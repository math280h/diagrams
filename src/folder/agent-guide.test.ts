import { describe, expect, it } from 'vitest'
import { AGENT_RULES } from '@/agent/instructions'
import { bundledSkillFiles, loadSkills } from '@/agent/skills'
import { TOOL_NAMES } from '@/agent/tool-definitions'
import { createDiagram } from '@/model/defaults'
import { fileGuideText, guideText, schemaText, toolsText } from './agent-guide'

describe('agent guide', () => {
  it('lists every tool with its input as JSON Schema', () => {
    const tools = JSON.parse(toolsText()) as { name: string; input: { type: string } }[]
    expect(tools.map((tool) => tool.name)).toEqual(TOOL_NAMES)
    for (const tool of tools) expect(tool.input.type).toBe('object')
  })

  it('gives the diagram format as JSON Schema', () => {
    const schema = JSON.parse(schemaText()) as { properties: Record<string, unknown> }
    expect(Object.keys(schema.properties)).toEqual(expect.arrayContaining(['id', 'name', 'nodes', 'edges', 'flows']))
  })

  it('gives a guide for direct changes with the rules, an example file and the format', () => {
    const example = createDiagram('Example')
    const guide = fileGuideText(example)
    expect(guide).toContain(AGENT_RULES)
    const [, exampleJson, schemaJson] = guide.split('```json\n').map((part) => part.split('\n```')[0]!)
    expect(JSON.parse(exampleJson!)).toMatchObject({ name: 'Example' })
    expect(JSON.parse(schemaJson!)).toEqual(JSON.parse(schemaText()))
  })

  it('names each tool and the file of each skill', () => {
    const skills = loadSkills(bundledSkillFiles())
    const guide = guideText(skills)
    expect(skills.length).toBeGreaterThan(0)
    for (const name of TOOL_NAMES) expect(guide).toContain(`\`${name}\``)
    for (const skill of skills) expect(guide).toContain(`.diagrams/skills/${skill.name}/SKILL.md`)
  })
})
