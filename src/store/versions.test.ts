import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Diagram } from '@/model/schema'
import { migrate } from '@/persistence/migrations'
import { fromDiagram, toDiagram } from '@/persistence/serialize'
import { memoryVersionStore, setVersionStore, versionStore } from '@/persistence/version-store'
import { DiagramBuilder } from '@/templates/builder'
import {
  beginVersions,
  previewVersion,
  asVersionAuthor,
  recordVersion,
  useVersions,
  VERSION_WINDOW_MS,
  versionsSettled,
} from './versions'

function diagram(titles: string[], id = 'd_test'): Diagram {
  const b = new DiagramBuilder()
  titles.forEach((title, index) => b.card(index * 300, 0, { title }))
  return { ...b.build('Shop'), id }
}

function withNodesOf(base: Diagram, other: Diagram): Diagram {
  return { ...base, nodes: [...base.nodes, ...other.nodes.filter((node) => !base.nodes.some((n) => n.id === node.id))] }
}

async function items() {
  await versionsSettled()
  return useVersions.getState().items
}

let t0 = 0

beforeEach(() => {
  setVersionStore(memoryVersionStore())
  t0 = Date.now() + 60_000
})
afterEach(() => {
  setVersionStore(null)
})

describe('version history', () => {
  it('records the state of a diagram that the history has not seen', async () => {
    beginVersions(diagram(['API', 'Orders DB']))
    const [opened] = await items()
    expect(opened).toMatchObject({ author: 'opened', summary: '2 nodes' })
  })

  it('joins user edits within the window and starts a new version after it', async () => {
    const start = diagram(['API'])
    beginVersions(start)
    const redis = withNodesOf(start, diagram(['Redis']))
    const kafka = withNodesOf(redis, diagram(['Kafka']))
    recordVersion(redis, t0 + 1_000)
    recordVersion(kafka, t0 + 2_000)
    expect((await items()).map((meta) => [meta.author, meta.summary])).toEqual([
      ['you', 'Added Redis and Kafka.'],
      ['opened', '1 node'],
    ])
    const later = withNodesOf(kafka, diagram(['Mail']))
    recordVersion(later, t0 + 1_000 + VERSION_WINDOW_MS + 1)
    expect((await items()).map((meta) => meta.summary)).toEqual(['Added Mail.', 'Added Redis and Kafka.', '1 node'])
  })

  it('gives each agent call its own version with the tool title', async () => {
    const start = diagram(['API'])
    beginVersions(start)
    const edited = withNodesOf(start, diagram(['Redis']))
    recordVersion(edited, t0 + 1_000)
    const moved = {
      ...edited,
      nodes: edited.nodes.map((node) => ({ ...node, position: { x: node.position.x, y: 80 } })),
    }
    asVersionAuthor({ author: 'agent', tool: 'Lay out diagram' }, () => recordVersion(moved, t0 + 2_000))
    const [agent, you] = await items()
    expect(agent).toMatchObject({ author: 'agent', tool: 'Lay out diagram' })
    expect(agent!.summary).toBe('Moved API and Redis.')
    expect(you!.author).toBe('you')
  })

  it('skips saves that change only the viewport or measured sizes', async () => {
    const start = diagram(['API'])
    beginVersions(start)
    recordVersion({ ...start, viewport: { x: 40, y: 0, zoom: 2 } })
    recordVersion({ ...start, nodes: start.nodes.map((node) => ({ ...node, measured: { width: 216, height: 60 } })) })
    expect(await items()).toHaveLength(1)
  })

  it('skips a save that differs from the loaded diagram only in key order and measured sizes', async () => {
    const b = new DiagramBuilder()
    const zone = b.group(0, 0, 640, 320, { label: 'VPC' })
    const api = b.card(40.125, 60, { title: 'API' }, 216, zone)
    b.edge(api, b.card(360, 60, { title: 'Orders DB' }, 216, zone), { label: 'SQL' })
    const loaded = migrate(JSON.parse(JSON.stringify({ ...b.build('Shop'), id: 'd_test' })))
    beginVersions(loaded)
    const { nodes, edges } = fromDiagram(loaded)
    const measured = nodes.map((node) => ({ ...node, measured: { width: 216, height: 72 } }))
    recordVersion(toDiagram({ ...loaded, nodes: measured, edges }))
    expect(await items()).toHaveLength(1)
  })

  it('counts a save outside an agent or restore change as an edit by the user', async () => {
    const start = diagram(['API'])
    beginVersions(start)
    asVersionAuthor({ author: 'agent', tool: 'Add nodes and edges' }, () => undefined)
    recordVersion(withNodesOf(start, diagram(['Redis'])), t0 + 1_000)
    const [edit] = await items()
    expect(edit).toMatchObject({ author: 'you' })
    expect(edit!.tool).toBeUndefined()
  })

  it('ends the preview of an older version when a new version is recorded', async () => {
    const start = diagram(['API'])
    beginVersions(start)
    await versionsSettled()
    const [opened] = useVersions.getState().items
    previewVersion(opened!.id)
    recordVersion(withNodesOf(start, diagram(['Redis'])), t0 + 1_000)
    expect(useVersions.getState().previewId).toBeNull()
  })

  it('records a change made outside the editor when the diagram opens again', async () => {
    const start = diagram(['API'])
    beginVersions(start)
    await versionsSettled()
    beginVersions(withNodesOf(start, diagram(['Redis'])))
    const [outside] = await items()
    expect(outside).toMatchObject({ author: 'outside', summary: 'Added Redis.' })
  })

  it('labels a restore and keeps the restored state', async () => {
    const start = diagram(['API'])
    beginVersions(start)
    const edited = withNodesOf(start, diagram(['Redis']))
    recordVersion(edited, t0 + 1_000)
    asVersionAuthor({ author: 'restore', restoredAt: 123 }, () => recordVersion(start, t0 + 2_000))
    const [restore] = await items()
    expect(restore).toMatchObject({ author: 'restore', restoredAt: 123, summary: 'Removed Redis.' })
    expect((await versionStore().load(restore!.id))?.nodes).toHaveLength(1)
  })
})
