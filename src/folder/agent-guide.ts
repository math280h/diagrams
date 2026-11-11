import { AGENT_INSTRUCTIONS, AGENT_RULES } from '@/agent/instructions'
import { bundledSkillFiles, loadSkills, SKILL_FILE, type Skill } from '@/agent/skills'
import { TOOL_DEFINITIONS, TOOL_NAMES } from '@/agent/tool-definitions'
import { DIAGRAM_FILE_SUFFIX } from '@/desktop/constants'
import { downloadBlob } from '@/lib/download'
import { z } from '@/lib/zod'
import { diagramSchema, type Diagram } from '@/model/schema'
import { serializeDiagram } from '@/persistence/cached-repository'
import { TEMPLATES } from '@/templates'
import {
  AGENT_FOLDER,
  CALLS_FOLDER,
  DELETED_FOLDER,
  FILE_GUIDE_FILE,
  GUIDE_FILE,
  ICONS_FILE,
  RESULTS_FOLDER,
  SCHEMA_FILE,
  SKILLS_FOLDER,
  STATUS_FOLDER,
  TOOLS_FILE,
} from './agent-paths'
import { writeText } from './folder-files'

const JSON_SCHEMA_OPTIONS = { io: 'input', unrepresentable: 'any' } as const
const IGNORED_FOLDERS = [CALLS_FOLDER, RESULTS_FOLDER, STATUS_FOLDER, DELETED_FOLDER]

function jsonText(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`
}

export function toolsText(): string {
  return jsonText(
    TOOL_NAMES.map((name) => {
      const definition = TOOL_DEFINITIONS[name]
      return {
        name,
        title: definition.title,
        description: definition.description,
        readOnly: definition.annotations.readOnlyHint,
        input: z.toJSONSchema(definition.input, JSON_SCHEMA_OPTIONS),
      }
    }),
  )
}

export function schemaText(): string {
  return jsonText(z.toJSONSchema(diagramSchema, JSON_SCHEMA_OPTIONS))
}

const at = (...parts: string[]) => `\`${[AGENT_FOLDER, ...parts].join('/')}\``

/** Returns the guide that tells an agent how to work with the diagrams of the folder through files. */
export function guideText(skills: readonly Skill[]): string {
  const skillList = skills.map((skill) => `- ${at(SKILLS_FOLDER, skill.name, SKILL_FILE)}: ${skill.description}`)
  return `# Diagrams in this folder

The \`*${DIAGRAM_FILE_SUFFIX}\` files in this folder are diagrams of the Diagrams website (https://draw.thias.dev). A browser tab of the website has this folder open. It shows each change at once, and the user can change the same diagrams there.

The website writes the files in \`${AGENT_FOLDER}\` each time it opens the folder. Do not change them, apart from the files in ${at(CALLS_FOLDER)}.

## Change diagrams with tools

The website runs the tools of the Diagrams MCP server. To call a tool:

1. Write a JSON file to ${at(CALLS_FOLDER)}, for example ${at(CALLS_FOLDER, '001-icons.json')}:

   \`\`\`json
   { "tool": "search_icons", "args": { "query": "postgres" } }
   \`\`\`

   Use a new file name for each call. Calls run one at a time, in the order of their file names.
2. Read the result with the same file name in ${at(RESULTS_FOLDER)}, for example ${at(RESULTS_FOLDER, '001-icons.json')}. It is there after a second or two. If it is not there yet, read it again.

A result looks like this:

\`\`\`json
{ "tool": "search_icons", "ok": true, "text": "…", "images": [] }
\`\`\`

\`text\` is the answer of the tool. \`images\` lists PNG files that you can read, for example from \`render_image\`. A failed call has \`"ok": false\` and an \`error\` that says what to change.

${at(TOOLS_FILE)} gives each tool with its description and its input as JSON Schema. The tools are: ${TOOL_NAMES.map((name) => `\`${name}\``).join(', ')}.

If no result comes within 30 seconds, ask the user to keep the website tab open, with "Let agents use this folder" on.

## Change diagram files directly

You can also change a \`*${DIAGRAM_FILE_SUFFIX}\` file. ${at(SCHEMA_FILE)} gives the format. The file name without \`${DIAGRAM_FILE_SUFFIX}\` is the diagram id, which the tools take as \`diagramId\`. After each change, the website writes:

- ${at(STATUS_FOLDER, '<id>.md')}: whether the file opens, and the problems that \`lint_diagram\` finds.
- ${at(STATUS_FOLDER, '<id>.png')}: an image of the diagram, as \`render_image\` makes it.

For larger changes, use the tools. They place new nodes, find nodes by label and keep the format valid.

## Icons

${at(ICONS_FILE)} has one line for each icon: the icon id, its title and its category, with tabs between them. Search it for a product or service name, then use the id as the \`icon\` of a node. The \`search_icons\` tool finds icons too.

## How to work

${AGENT_INSTRUCTIONS}

## Skills

Skills give step-by-step guidance. Before a larger task, read the matching skill:
${skillList.join('\n')}
`
}

/** Returns the icon list: one line for each icon with its id, title and category, with tabs between them. */
export async function iconsText(): Promise<string> {
  const [{ loadIconSets }, { loadIconNames }] = await Promise.all([
    import('@/canvas/icons/library'),
    import('@/canvas/icon-cache'),
  ])
  const [sets, lucide] = await Promise.all([loadIconSets(), loadIconNames()])
  const lines = sets.flatMap((set) => set.entries.map((entry) => `${entry.id}\t${entry.title}\t${entry.category}`))
  for (const name of lucide) lines.push(`${name}\t${name}\tLucide`)
  return `${lines.join('\n')}\n`
}

async function writeFolder(root: FileSystemDirectoryHandle, files: Record<string, string>) {
  for (const [path, text] of Object.entries(files)) {
    const parts = path.split('/')
    let folder = root
    for (const part of parts.slice(0, -1)) folder = await folder.getDirectoryHandle(part, { create: true })
    await writeText(folder, parts.at(-1)!, text)
  }
}

/**
 * Writes the tool list, the format, the icon list, the skills and then the guide to the agent folder. An agent that
 * finds the guide finds the other files too.
 */
export async function writeGuideFiles(agentFolder: FileSystemDirectoryHandle) {
  const skills = loadSkills(bundledSkillFiles())
  await writeFolder(agentFolder, {
    [TOOLS_FILE]: toolsText(),
    [SCHEMA_FILE]: schemaText(),
    [ICONS_FILE]: await iconsText(),
    '.gitignore': `${IGNORED_FOLDERS.map((folder) => `${folder}/`).join('\n')}\n`,
    ...Object.fromEntries(
      skills.flatMap((skill) => skill.files.map((file) => [`${SKILLS_FOLDER}/${file.path}`, file.text])),
    ),
    [GUIDE_FILE]: guideText(skills),
  })
}

/** Returns the guide for an agent that changes the diagram files directly, in a folder that the website only reads. */
export function fileGuideText(example: Diagram): string {
  return `# Diagrams in this folder

The \`*${DIAGRAM_FILE_SUFFIX}\` files in this folder are diagrams of the Diagrams website (https://draw.thias.dev). A browser tab shows them, and shows each change to a file at once. The tab can only read the folder, so there are no tool calls and no status files: change the files directly.

The tab sees a new file only after the user chooses the folder again. When you add a file, tell the user to do that.

## Change a diagram file

- One file holds one diagram. The file name without \`${DIAGRAM_FILE_SUFFIX}\` is the diagram id, and the \`id\` in the file is the same.
- Read a file before you change it, and keep the ids of the nodes, edges and flows that stay.
- Give each new node, edge and flow an id that the diagram does not use yet.
- Give each node a \`position\` in pixels, with room between the nodes: the tab does not arrange a file. A node in a boundary has the boundary as its \`parentId\`, and its position is relative to the boundary.
- Keep the file valid JSON that matches the schema at the end of this guide. If the tab cannot open a file, it tells the user.

## Icons

The \`icon\` of a node is an icon id, such as \`aws:lambda\` or \`database\`. If \`${ICONS_FILE}\` is next to this guide, search it for a product or service name. Each line has the icon id, its title and its category, with tabs between them.

## Rules

${AGENT_RULES}

## Example

A diagram file:

\`\`\`json
${serializeDiagram(example).trim()}
\`\`\`

## JSON Schema

\`\`\`json
${schemaText().trim()}
\`\`\`
`
}

/** Downloads the guide for direct changes, with the template with the fewest nodes as the example. */
export function downloadFileGuide() {
  const [example] = TEMPLATES.map((template) => template.build()).toSorted((a, b) => a.nodes.length - b.nodes.length)
  if (example) downloadBlob(new Blob([fileGuideText(example)], { type: 'text/markdown' }), FILE_GUIDE_FILE)
}

export async function downloadIconList() {
  downloadBlob(new Blob([await iconsText()], { type: 'text/plain' }), ICONS_FILE)
}
