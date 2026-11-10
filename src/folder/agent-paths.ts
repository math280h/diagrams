/** The folder for agents inside the diagrams folder. The website writes it, apart from `calls`. */
export const AGENT_FOLDER = '.diagrams'
export const CALLS_FOLDER = 'calls'
export const RESULTS_FOLDER = 'results'
export const STATUS_FOLDER = 'status'
export const SKILLS_FOLDER = 'skills'
export const CALL_SUFFIX = '.json'
export const GUIDE_FILE = 'README.md'
export const TOOLS_FILE = 'tools.json'
export const SCHEMA_FILE = 'diagram.schema.json'
export const ICONS_FILE = 'icons.txt'

/** Returns the line that tells Claude Code where the guide of the folder is. */
export function claudeInstruction(folderName: string) {
  return `Diagrams: before you draw or change a diagram, read ${AGENT_FOLDER}/${GUIDE_FILE} in the "${folderName}" folder.`
}
