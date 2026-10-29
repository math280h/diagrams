import { z } from 'zod'
import type { ToolOutcome } from '@/desktop/contract'
import { errorMessage } from '@/lib/error-message'
import { createSerialQueue } from '@/lib/serial-queue'
import { useAgentActivity } from './activity-store'
import type { HandlerContext } from './context'
import { HANDLERS } from './handlers'
import { isToolName, TOOL_DEFINITIONS, type ToolName } from './tool-definitions'

const CANCELLED = 'The request was cancelled.'
const NO_CHANGES = 'No visible changes.'

const enqueue = createSerialQueue()

function whenAborted(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) resolve()
    else signal.addEventListener('abort', () => resolve(), { once: true })
  })
}

async function execute(tool: ToolName, input: unknown, ctx: HandlerContext): Promise<ToolOutcome> {
  const { title, annotations } = TOOL_DEFINITIONS[tool]
  useAgentActivity.setState({ title, readOnly: annotations.readOnlyHint })
  try {
    const handler = HANDLERS[tool] as (input: unknown, ctx: HandlerContext) => ReturnType<(typeof HANDLERS)[ToolName]>
    const content = await handler(input, ctx)
    const changes = ctx.changes.filter((change) => change !== NO_CHANGES)
    if (changes.length > 0) content.push({ type: 'text', text: `Changes: ${changes.join(' ')}` })
    return { ok: true, content }
  } catch (error) {
    return { ok: false, message: errorMessage(error) }
  } finally {
    useAgentActivity.setState({ title: null, readOnly: false })
  }
}

/**
 * Runs an agent tool with validated arguments. Calls run one at a time.
 *
 * The time limit of a call starts when the call leaves the queue. At the limit, the call returns an error. The next
 * call starts only after the earlier handler ends.
 *
 * @param timeoutMs - The time limit. Without it, the limit of the tool definition applies.
 * @returns The tool result, or `ok: false` with a message that the agent can act on.
 */
export function runAgentTool(
  tool: string,
  args: unknown,
  signal: AbortSignal,
  createContext: (signal: AbortSignal) => Omit<HandlerContext, 'toolTitle' | 'changes'>,
  timeoutMs?: number,
): Promise<ToolOutcome> {
  if (!isToolName(tool)) return Promise.resolve({ ok: false, message: `The app has no tool "${tool}".` })
  const definition = TOOL_DEFINITIONS[tool]
  const parsed = definition.input.safeParse(args)
  if (!parsed.success) return Promise.resolve({ ok: false, message: z.prettifyError(parsed.error) })
  const limitMs = timeoutMs ?? definition.timeoutMs
  return new Promise<ToolOutcome>((resolve) => {
    enqueue(async () => {
      const callSignal = AbortSignal.any([signal, AbortSignal.timeout(limitMs)])
      const outcome = execute(tool, parsed.data, {
        ...createContext(callSignal),
        toolTitle: definition.title,
        changes: [],
      })
      const stopped = whenAborted(callSignal).then((): ToolOutcome => ({
        ok: false,
        message: signal.aborted ? CANCELLED : `The tool did not finish within ${limitMs} ms.`,
      }))
      resolve(await Promise.race([outcome, stopped]))
      await outcome
    }, signal).catch(() => resolve({ ok: false, message: CANCELLED }))
  })
}
