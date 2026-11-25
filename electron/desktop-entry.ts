const PLAIN_EXEC_ARG = /^[\w/.,:@=+-]+$/
const MAIN_GROUP = '[Desktop Entry]'
const STRING_ESCAPES: Readonly<Record<string, string>> = { s: ' ', n: '\n', t: '\t', r: '\r', '\\': '\\' }

function assertOneLine(value: string) {
  if (/[\n\r]/.test(value)) throw new Error('A path of the app has a line break, so the system cannot start it.')
}

// The Desktop Entry Specification puts an Exec argument with other characters in double quotes, with a backslash
// before ", `, $ and \. The string value then needs a second backslash before each backslash, and %% for a literal %.
function execArg(arg: string): string {
  assertOneLine(arg)
  if (PLAIN_EXEC_ARG.test(arg)) return arg
  const quoted = `"${arg.replace(/["`$\\]/g, '\\$&')}"`
  return quoted.replaceAll('\\', '\\\\').replaceAll('%', '%%')
}

/**
 * Returns the Exec value of a desktop entry that runs the command.
 *
 * @throws Error If an argument has a line break.
 */
export function execValue(command: readonly string[]): string {
  return command.map(execArg).join(' ')
}

/**
 * Returns a string value for a desktop entry, with a second backslash before each backslash.
 *
 * @throws Error If the value has a line break.
 */
export function stringValue(value: string): string {
  assertOneLine(value)
  return value.replaceAll('\\', '\\\\')
}

/**
 * Reads the keys of the main group of a desktop entry. The keys of other groups, for example of actions, are not in
 * the result.
 */
export function entryValues(text: string): Map<string, string> {
  const values = new Map<string, string>()
  let main = true
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed.startsWith('[')) {
      main = trimmed === MAIN_GROUP
      continue
    }
    // The Desktop Entry Specification ignores spaces before and after the = of a key.
    const separator = line.indexOf('=')
    if (main && separator > 0) values.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim())
  }
  return values
}

function unescapeString(value: string): string {
  return value.replace(/\\([sntr\\])/g, (_match, code: string) => STRING_ESCAPES[code] ?? code)
}

function quotedArg(text: string): string | null {
  let arg = ''
  for (let index = 1; index < text.length; index++) {
    const char = text[index]!
    if (char === '"') return arg
    arg += char === '\\' && index + 1 < text.length ? text[++index] : char
  }
  return null
}

function firstExecArg(exec: string): string | null {
  const text = unescapeString(exec).trimStart()
  const arg = text.startsWith('"') ? quotedArg(text) : text.split(/\s/, 1)[0]
  return arg ? arg.replaceAll('%%', '%') : null
}

/**
 * Returns the program that a desktop entry starts: its TryExec, else the first argument of its Exec.
 *
 * @returns The path or the name of the program, or `null` if the entry names no program.
 */
export function entryProgram(text: string): string | null {
  const values = entryValues(text)
  const tryExec = values.get('TryExec')
  if (tryExec) return unescapeString(tryExec)
  const exec = values.get('Exec')
  return exec ? firstExecArg(exec) : null
}
