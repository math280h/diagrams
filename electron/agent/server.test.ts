import { request } from 'node:http'
import { createServer, type Server } from 'node:net'
import { Client, InMemoryTransport, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TOOL_NAMES } from '@/agent/tool-definitions'
import type { ToolOutcome } from '@/desktop/contract'
import { createAgentServer, startAgentServer } from './server'
import { RENAMED_PROMPTS, bundledSkillFiles, loadSkills, registerSkills } from './skills'

const TOKEN = 'a'.repeat(43)
const skills = loadSkills(bundledSkillFiles())

function makeServer(
  port: number,
  callTool = vi.fn(async (): Promise<ToolOutcome> => ({ ok: true, content: [] })),
  version = '1.2.3',
) {
  const server = createAgentServer({
    version,
    port,
    instructions: 'Use the tools.',
    token: () => TOKEN,
    callTool,
    extend: (mcp) => registerSkills(mcp, skills),
    renamedPrompts: RENAMED_PROMPTS,
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
  it('reports the version of the app, also for a release preview', async () => {
    for (const version of ['1.2.3', '0.3.0-beta.1', '0.1.5-preview.57']) {
      const client = await inMemoryClient(makeServer(1, undefined, version).server)
      expect(client.getServerVersion()).toMatchObject({ name: 'diagrams', version })
    }
    const client = await inMemoryClient(makeServer(1, undefined, 'dev').server)
    expect(client.getServerVersion()?.version).toBe('0.0.0')
  })

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

  it('passes the diagram settings on and refuses them as theme with the name of the new argument', async () => {
    const { server, callTool } = makeServer(1)
    const client = await inMemoryClient(server)
    const settings = { fonts: 'inter', snap: false }
    await client.callTool({ name: 'update_diagram', arguments: { settings } })
    expect(callTool).toHaveBeenCalledWith('update_diagram', { settings }, expect.any(AbortSignal))

    callTool.mockClear()
    const result = await client.callTool({ name: 'update_diagram', arguments: { theme: settings } })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain('in \\"settings\\"')
    expect(callTool).not.toHaveBeenCalled()
  })

  it('serves the skills as resources and prompts', async () => {
    const client = await inMemoryClient(makeServer(1).server)
    const { resources } = await client.listResources()
    expect(resources.map((resource) => resource.uri)).toContain('skill://diagrams/architecture/SKILL.md')
    const skill = await client.readResource({ uri: 'skill://diagrams/flows/SKILL.md' })
    expect(JSON.stringify(skill.contents)).toContain('Animate a flow')
    const prompt = await client.getPrompt({ name: 'architecture', arguments: { request: 'a shop' } })
    expect(JSON.stringify(prompt.messages)).toContain('Task: a shop')
  })

  it('serves one prompt for each skill, with the name and the text of the skill', async () => {
    const client = await inMemoryClient(makeServer(1).server)
    const { prompts } = await client.listPrompts()
    expect(prompts.map((prompt) => prompt.name).toSorted()).toEqual(skills.map((skill) => skill.name).toSorted())
    for (const prompt of prompts) {
      const skill = skills.find((candidate) => candidate.name === prompt.name)!
      expect(prompt.arguments).toHaveLength(1)
      const argument = prompt.arguments![0]!
      const result = await client.getPrompt({ name: prompt.name, arguments: { [argument.name]: 'the task' } })
      expect(result.messages).toHaveLength(1)
      const text = (result.messages[0]!.content as { text: string }).text
      expect(text.startsWith(skill.body.trim())).toBe(true)
      expect(text).toContain('Task: the task')
    }
  })

  it('gives the infrastructure skill a prompt that takes the request', async () => {
    const client = await inMemoryClient(makeServer(1).server)
    const { prompts } = await client.listPrompts()
    expect(prompts.find((prompt) => prompt.name === 'infrastructure')?.arguments).toEqual([
      expect.objectContaining({ name: 'request', required: true }),
    ])
    const prompt = await client.getPrompt({ name: 'infrastructure', arguments: { request: 'draw infra/' } })
    const text = JSON.stringify(prompt.messages)
    expect(text).toContain('Diagrams from infrastructure code')
    expect(text).toContain('skill://diagrams/infrastructure/references/terraform.md')
    expect(text).toContain('Task: draw infra/')
  })

  it('does not list the earlier prompt names', async () => {
    const client = await inMemoryClient(makeServer(1).server)
    const names = (await client.listPrompts()).prompts.map((prompt) => prompt.name)
    for (const name of Object.keys(RENAMED_PROMPTS)) expect(names).not.toContain(name)
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

  it('refuses an earlier prompt name with an error that gives the new name', async () => {
    const port = await freePort()
    const { server } = makeServer(port)
    expect((await startAgentServer(server, port)).state).toBe('running')
    running = server

    const getOldPrompt = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'prompts/get',
      params: { name: 'animate-flow', arguments: {} },
    })
    const unauthenticated = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: getOldPrompt,
    })
    expect(unauthenticated.status).toBe(401)

    for (const mode of ['legacy', 'auto'] as const) {
      const client = new Client({ name: 'test', version: '1.0.0' }, { versionNegotiation: { mode } })
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
          requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
        }),
      )
      for (const [earlier, current] of Object.entries(RENAMED_PROMPTS)) {
        await expect(client.getPrompt({ name: earlier, arguments: { request: 'a shop' } })).rejects.toThrow(
          `The prompt "${earlier}" has a new name: "${current}".`,
        )
      }
      const prompt = await client.getPrompt({ name: 'flows', arguments: { request: 'an order' } })
      expect(JSON.stringify(prompt.messages)).toContain('Task: an order')
      await expect(client.getPrompt({ name: 'missing' })).rejects.toThrow('missing')
      await client.close()
    }
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
