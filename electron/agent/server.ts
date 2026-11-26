import { createServer } from 'node:net'
import { UserError, ViteMCP, type ContentResult, type Logger } from '@vitemcp/server'
import type { Hono } from 'hono'
import { TOOL_DEFINITIONS, TOOL_NAMES, type ToolName } from '@/agent/tool-definitions'
import { AGENT_ENDPOINT, AGENT_HOST, MAX_HANDOFF_BYTES } from '@/desktop/constants'
import type { AgentState, ToolOutcome } from '@/desktop/contract'
import { errorMessage } from '@/lib/error-message'
import { z } from '@/lib/zod'
import { bearerMatches } from './token'

const START_TIMEOUT_MS = 5000

type AgentAuth = { client: 'token' }

export interface AgentServerOptions {
  version: string
  port: number
  instructions: string
  /** Returns the current access token. */
  token: () => string
  callTool: (tool: ToolName, args: unknown, signal: AbortSignal) => Promise<ToolOutcome>
  /** Adds resources and prompts. */
  extend?: (server: ViteMCP<AgentAuth>) => void
  /**
   * Maps each earlier prompt name to its new name.
   *
   * A `prompts/get` call for an earlier name gets an error that gives the new name.
   */
  renamedPrompts?: Readonly<Record<string, string>>
  /** Adds HTTP routes. They run before the MCP endpoint. */
  routes?: (app: Hono) => void
  logger?: Logger
}

function toMcpResult(outcome: ToolOutcome): ContentResult {
  if (!outcome.ok) throw new UserError(outcome.message)
  return {
    content: outcome.content.map((block) =>
      block.type === 'text'
        ? { type: 'text', text: block.text }
        : { type: 'image', data: block.data, mimeType: block.mimeType },
    ),
  }
}

const JSON_RPC_INVALID_PARAMS = -32_602

const PROMPT_REQUEST = z.object({
  id: z.union([z.string(), z.number()]),
  method: z.literal('prompts/get'),
  params: z.object({ name: z.string() }),
})

async function renamedPromptError(request: Request, renamed: Readonly<Record<string, string>>) {
  let body: unknown
  try {
    body = JSON.parse(await request.clone().text())
  } catch {
    return null
  }
  const call = PROMPT_REQUEST.safeParse(body)
  if (!call.success || !Object.hasOwn(renamed, call.data.params.name)) return null
  const { id, params } = call.data
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: JSON_RPC_INVALID_PARAMS,
      message: `The prompt "${params.name}" has a new name: "${renamed[params.name]}".`,
    },
  }
}

const SEMVER = /^\d+\.\d+\.\d+(?:-[\dA-Za-z-]+(?:\.[\dA-Za-z-]+)*)?(?:\+[\dA-Za-z-]+(?:\.[\dA-Za-z-]+)*)?$/

// MCP accepts any version text, but the type of @vitemcp/server accepts only x.y.z, also for a pre-release.
function semver(version: string): `${number}.${number}.${number}` {
  return SEMVER.test(version) ? (version as `${number}.${number}.${number}`) : '0.0.0'
}

/**
 * Creates the MCP server of the app. Each tool call goes to `callTool`, which runs it in the app window.
 *
 * Requests must name the loopback host and carry the bearer token. The server rejects browser origins.
 */
export function createAgentServer(options: AgentServerOptions) {
  const server = new ViteMCP<AgentAuth>({
    name: 'diagrams',
    title: 'Diagrams',
    version: semver(options.version),
    description: 'Read, edit and render the diagrams of the Diagrams desktop app.',
    instructions: options.instructions,
    health: { enabled: false },
    ...(options.logger ? { logger: options.logger } : {}),
    authenticate: async (request) =>
      bearerMatches(request.headers.get('authorization'), options.token()) ? { client: 'token' } : null,
  })

  for (const name of TOOL_NAMES) {
    const definition = TOOL_DEFINITIONS[name]
    server.addTool({
      name,
      description: definition.description,
      parameters: definition.input,
      annotations: { title: definition.title, ...definition.annotations },
      execute: async (args, context) => toMcpResult(await options.callTool(name, args, context.signal)),
    })
  }
  options.extend?.(server)

  const app = server.getApp()
  const hosts = new Set([`${AGENT_HOST}:${options.port}`, `localhost:${options.port}`])
  app.use('*', async (c, next) => {
    if (!hosts.has(c.req.header('host')?.toLowerCase() ?? '')) return c.text('Forbidden', 403)
    await next()
  })
  const renamedPrompts = options.renamedPrompts
  if (renamedPrompts) {
    app.post(AGENT_ENDPOINT, async (c, next) => {
      const caller = !c.req.header('origin') && bearerMatches(c.req.header('authorization'), options.token())
      const error = caller ? await renamedPromptError(c.req.raw, renamedPrompts) : null
      if (error) return c.json(error)
      await next()
    })
  }
  options.routes?.(app)
  return server
}

export function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer()
    probe.once('error', () => resolve(false))
    probe.listen(port, AGENT_HOST, () => probe.close(() => resolve(true)))
  })
}

/**
 * Starts the server on the loopback address.
 *
 * @returns `running`, `port-in-use` or `failed`, with a message for the last two.
 */
export async function startAgentServer(
  server: ViteMCP<AgentAuth>,
  port: number,
): Promise<{ state: AgentState; message: string | null }> {
  if (!(await portIsFree(port))) {
    return {
      state: 'port-in-use',
      message: `Another program uses port ${port}, for example a second Diagrams app.`,
    }
  }
  try {
    await Promise.race([
      server.start({
        transportType: 'httpStream',
        httpStream: {
          port,
          host: AGENT_HOST,
          endpoint: AGENT_ENDPOINT,
          cors: false,
          allowedOrigins: [],
          maxBodySize: MAX_HANDOFF_BYTES,
        },
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('The agent server did not start.')), START_TIMEOUT_MS),
      ),
    ])
    return { state: 'running', message: null }
  } catch (error) {
    return { state: 'failed', message: errorMessage(error) }
  }
}
