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
/** The guide that a browser without folder access offers as a download, for an agent that changes files directly. */
export const FILE_GUIDE_FILE = 'diagrams-guide.md'

/** Returns the line that tells Claude Code where the guide of the folder is. */
export function claudeInstruction(folderName: string) {
  return `Diagrams: before you draw or change a diagram, read ${AGENT_FOLDER}/${GUIDE_FILE} in the "${folderName}" folder.`
}

/** Returns the line that tells Claude Code where the guide is, in a folder that the website only reads. */
export function fileGuideInstruction(folderName: string) {
  return `Diagrams: before you draw or change a diagram, read ${FILE_GUIDE_FILE} in the "${folderName}" folder.`
}
