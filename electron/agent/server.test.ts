import { request } from 'node:http'
import { createServer, type Server } from 'node:net'
import { Client, InMemoryTransport, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TOOL_NAMES } from '@/agent/tool-definitions'
import type { ToolOutcome } from '@/desktop/contract'
import { createAgentServer, startAgentServer } from './server'
import { bundledSkillFiles, loadSkills, registerSkills } from './skills'

const TOKEN = 'a'.repeat(43)
const skills = loadSkills(bundledSkillFiles())

function makeServer(port: number, callTool = vi.fn(async (): Promise<ToolOutcome> => ({ ok: true, content: [] }))) {
  const server = createAgentServer({
    version: '1.2.3',
    port,
    instructions: 'Use the tools.',
    token: () => TOKEN,
    callTool,
    extend: (mcp) => registerSkills(mcp, skills),
    logger: { debug() {}, info() {}, log() {}, warn() {}, error() {} },
  })
  return { server, callTool }
}

async function inMemoryClient(server: ReturnType<typeof makeServer>['server']) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await server.connect(serverSide)
  const client = new Client({ name: 'test', version: '1.0.0' })
  await client.connect(clientSide)
  return client
}

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer()
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number }
      probe.close(() => resolve(port))
    })
  })
}

describe('agent server over MCP', () => {
  it('lists every tool with its schema and annotations', async () => {
    const client = await inMemoryClient(makeServer(1).server)
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name).toSorted()).toEqual([...TOOL_NAMES].toSorted())
    const render = tools.find((tool) => tool.name === 'render_image')!
    expect(render.annotations).toMatchObject({ title: 'Render image', readOnlyHint: true })
    expect(render.inputSchema.properties).toHaveProperty('focus')
  })

  it('forwards a call and returns text and image blocks', async () => {
    const callTool = vi.fn(async (): Promise<ToolOutcome> => ({
      ok: true,
      content: [
        { type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgo=' },
        { type: 'text', text: '{"width":10}' },
      ],
    }))
    const client = await inMemoryClient(makeServer(1, callTool).server)
    const result = await client.callTool({ name: 'render_image', arguments: { maxSizePx: 512 } })
    expect(callTool).toHaveBeenCalledWith('render_image', { maxSizePx: 512 }, expect.any(AbortSignal))
    expect(result.content).toEqual([
      { type: 'image', mimeType: 'image/png', data: 'iVBORw0KGgo=' },
      { type: 'text', text: '{"width":10}' },
    ])
  })

  it('turns a failed call into an error result with the message', async () => {
    const callTool = vi.fn(async (): Promise<ToolOutcome> => ({ ok: false, message: 'No node "Cache".' }))
    const client = await inMemoryClient(makeServer(1, callTool).server)
    const result = await client.callTool({ name: 'get_diagram', arguments: {} })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain('No node \\"Cache\\".')
  })

  it('serves the skills as resources and prompts', async () => {
    const client = await inMemoryClient(makeServer(1).server)
    const { resources } = await client.listResources()
    expect(resources.map((resource) => resource.uri)).toContain('skill://diagrams/architecture/SKILL.md')
    const skill = await client.readResource({ uri: 'skill://diagrams/flows/SKILL.md' })
    expect(JSON.stringify(skill.contents)).toContain('Animate a flow')
    const prompt = await client.getPrompt({ name: 'draw-architecture', arguments: { request: 'a shop' } })
    expect(JSON.stringify(prompt.messages)).toContain('Task: a shop')
  })
})

describe('agent server over HTTP', () => {
  let running: { stop: () => Promise<void> } | null = null
  let blocker: Server | null = null

  afterEach(async () => {
    await running?.stop()
    running = null
    await new Promise<void>((resolve) => (blocker ? blocker.close(() => resolve()) : resolve()))
    blocker = null
  })

  const LIST_TOOLS = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })

  const post = (port: number, headers: Record<string, string>) =>
    fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
      body: LIST_TOOLS,
    })

  // fetch in Node replaces a Host header that the caller sets.
  const statusForHost = (port: number, path: string, host: string) =>
    new Promise<number>((resolve, reject) => {
      const outgoing = request(
        {
          host: '127.0.0.1',
          port,
          path,
          method: 'POST',
          headers: {
            host,
            authorization: `Bearer ${TOKEN}`,
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
          },
        },
        (response) => {
          response.resume()
          resolve(response.statusCode ?? 0)
        },
      )
      outgoing.on('error', reject)
      outgoing.end(LIST_TOOLS)
    })

  it('needs the token, rejects browser origins and answers a client with the token', async () => {
    const port = await freePort()
    const { server } = makeServer(port)
    expect(await startAgentServer(server, port)).toEqual({ state: 'running', message: null })
    running = server

    expect((await post(port, {})).status).toBe(401)
    expect((await post(port, { authorization: 'Bearer wrong' })).status).toBe(401)
    expect((await post(port, { authorization: `Bearer ${TOKEN}`, origin: 'https://evil.example' })).status).toBe(403)

    const client = new Client({ name: 'test', version: '1.0.0' })
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
      }),
    )
    expect((await client.listTools()).tools.length).toBe(TOOL_NAMES.length)
    await client.close()

    expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(404)
  })

  it('rejects requests for another host name', async () => {
    const port = await freePort()
    const { server } = makeServer(port)
    expect((await startAgentServer(server, port)).state).toBe('running')
    running = server

    expect(await statusForHost(port, '/mcp', 'evil.example')).toBe(403)
    expect(await statusForHost(port, '/mcp', `evil.example:${port}`)).toBe(403)
    expect(await statusForHost(port, '/handoff/code', `evil.example:${port}`)).toBe(403)
    expect(await statusForHost(port, '/mcp', `localhost:${port}`)).not.toBe(403)
  })

  it('reports a port that another program uses', async () => {
    const port = await freePort()
    blocker = createServer()
    await new Promise<void>((resolve) => blocker!.listen(port, '127.0.0.1', resolve))
    const result = await startAgentServer(makeServer(port).server, port)
    expect(result.state).toBe('port-in-use')
  })
})
