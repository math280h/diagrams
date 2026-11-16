import type { StackFrame } from './report'

const MAX_FRAMES = 20
const EXTENSION_SCHEMES = /^(?:chrome|moz|safari-web|ms-browser)-extension:/i
const V8_LINE = /^\s*at /
const V8_FRAME = /^\s*at (?:(?:async |new )?(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/
const GECKO_FRAME = /^\s*(.*?)@(.+?):(\d+):(\d+)\s*$/

/** Returns the file name of a script address or path, without the folders, the query and the fragment. */
export function scriptFileName(location: string): string {
  if (EXTENSION_SCHEMES.test(location)) return 'extension'
  if (location.startsWith('node:')) return location.split(/[?#]/)[0] ?? location
  const withoutSuffix = location.split(/[?#]/)[0] ?? ''
  const name = withoutSuffix.split(/[\\/]/).pop() ?? ''
  return name === '' ? 'unknown' : name
}

function functionName(raw: string | undefined): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  if (trimmed.startsWith('eval at')) return 'eval'
  return trimmed.length > 120 ? trimmed.slice(0, 120) : trimmed
}

function parseLine(line: string, format: RegExp): StackFrame | null {
  const match = format.exec(line)
  if (!match) return null
  const [, fn, location, lineText, columnText] = match
  if (!location || location.startsWith('eval at') || location.startsWith('<anonymous>')) {
    return { function: functionName(fn), file: 'anonymous', line: Number(lineText), column: Number(columnText) }
  }
  return {
    function: functionName(fn),
    file: scriptFileName(location),
    line: Number(lineText),
    column: Number(columnText),
  }
}

/**
 * Returns the frames of an error stack from Chromium, Node, Firefox or Safari. Each frame keeps the function name and
 * the file name, never the folders or the address of the file.
 */
export function stackFrames(stack: string): StackFrame[] {
  const lines = stack.split('\n')
  const format = lines.some((line) => V8_LINE.test(line)) ? V8_FRAME : GECKO_FRAME
  const frames: StackFrame[] = []
  for (const line of lines) {
    const frame = parseLine(line, format)
    if (frame) frames.push(frame)
    if (frames.length === MAX_FRAMES) break
  }
  return frames
}
