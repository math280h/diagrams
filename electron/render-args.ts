import path from 'node:path'
import type { RenderFormat } from '@/desktop/contract'

const FORMATS: ReadonlySet<string> = new Set<RenderFormat>(['png', 'svg', 'gif', 'mp4', 'webm'])

export const RENDER_USAGE = `Usage: Diagrams --render <diagram file> --out <image or video file> [options]

The format comes from the extension of --out: .png, .svg, .gif, .mp4 or .webm.

Options:
  --theme dark|light   The canvas theme. The default is the theme of the diagram.
  --flow <name or id>  The flow to play in a video, or to show in an image.
  --path <name or id>  With --flow: the path of the flow. Without it, the main steps.
  --step <number>      With --flow and an image: the step to show, from 0, among the steps
                       of the path.
  --max-size <pixels>  The longest side of the output. Without it, an image is at most 2048
                       pixels, a video 1280 and a GIF 960.`

export interface RenderArgs {
  input: string
  output: string
  format: RenderFormat
  theme?: 'dark' | 'light'
  flow?: string
  path?: string
  step?: number
  maxSizePx?: number
}

export class RenderUsageError extends Error {}

/**
 * Reads the render options from the command line.
 *
 * @returns The options, or `null` if the command line does not ask for a render.
 * @throws RenderUsageError If an option is missing or has a wrong value.
 */
export function parseRenderArgs(argv: readonly string[]): RenderArgs | null {
  const start = argv.indexOf('--render')
  if (start === -1) return null
  const values = new Map<string, string>()
  for (let index = start; index < argv.length; index += 2) {
    const name = argv[index]!
    const value = argv[index + 1]
    if (!name.startsWith('--')) throw new RenderUsageError(`Unexpected argument "${name}".`)
    if (value === undefined || value.startsWith('--')) throw new RenderUsageError(`${name} needs a value.`)
    values.set(name.slice(2), value)
  }
  const input = values.get('render')!
  const output = values.get('out')
  if (!output) throw new RenderUsageError('--out is missing.')
  const format = path.extname(output).slice(1).toLowerCase()
  if (!FORMATS.has(format)) throw new RenderUsageError(`--out must end in .png, .svg, .gif, .mp4 or .webm.`)
  const theme = values.get('theme')
  if (theme !== undefined && theme !== 'dark' && theme !== 'light') {
    throw new RenderUsageError('--theme must be dark or light.')
  }
  const step = values.get('step')
  const stepNumber = step === undefined ? undefined : Number(step)
  if (stepNumber !== undefined && (!Number.isInteger(stepNumber) || stepNumber < 0)) {
    throw new RenderUsageError('--step must be a whole number from 0.')
  }
  const maxSizeText = values.get('max-size')
  const maxSize = maxSizeText === undefined ? undefined : Number(maxSizeText)
  if (maxSize !== undefined && (!Number.isInteger(maxSize) || maxSize < 64 || maxSize > 8192)) {
    throw new RenderUsageError('--max-size must be a whole number from 64 to 8192.')
  }
  for (const name of values.keys()) {
    if (!['render', 'out', 'theme', 'flow', 'path', 'step', 'max-size'].includes(name)) {
      throw new RenderUsageError(`Unknown option --${name}.`)
    }
  }
  return {
    input: path.resolve(input),
    output: path.resolve(output),
    format: format as RenderFormat,
    ...(theme ? { theme } : {}),
    ...(values.has('flow') ? { flow: values.get('flow') } : {}),
    ...(values.has('path') ? { path: values.get('path') } : {}),
    ...(stepNumber !== undefined ? { step: stepNumber } : {}),
    ...(maxSize !== undefined ? { maxSizePx: maxSize } : {}),
  }
}
