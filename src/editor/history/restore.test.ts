import { afterEach, describe, expect, it, vi } from 'vitest'
import { nodeLabel } from '@/model/labels'
import type { Diagram } from '@/model/schema'
import { memoryVersionStore, setVersionStore, type VersionStore } from '@/persistence/version-store'
import { useDoc } from '@/store/doc-store'
import { openDiagram } from '@/store/document'
import { resetHistory } from '@/store/history'
import {
  beginVersions,
  previewVersion,
  recordVersion,
  useVersions,
  VERSION_WINDOW_MS,
  versionsSettled,
} from '@/store/versions'
import { DiagramBuilder } from '@/templates/builder'
import { restoreVersion } from './restore'

function diagram(titles: string[]): Diagram {
  const b = new DiagramBuilder()
  titles.forEach((title, index) => b.card(index * 300, 0, { title }))
  return { ...b.build('Shop'), id: 'd_restore' }
}

function cardTitles() {
  return useDoc.getState().nodes.map(nodeLabel)
}

afterEach(() => {
  setVersionStore(null)
  resetHistory()
})

describe('restoreVersion', () => {
  it('restores the selected version, not the one the canvas still shows while it loads', async () => {
    const memory = memoryVersionStore()
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let gated: string | null = null
    const store: VersionStore = {
      ...memory,
      load: async (id) => {
        if (id === gated) await gate
        return memory.load(id)
      },
    }
    setVersionStore(store)

    const first = diagram(['API'])
    openDiagram(first)
    beginVersions(first)
    const second = { ...first, nodes: [...first.nodes, ...diagram(['Redis']).nodes] }
    recordVersion(second, Date.now() + 1000)
    const third = { ...second, nodes: [...second.nodes, ...diagram(['Kafka']).nodes] }
    recordVersion(third, Date.now() + VERSION_WINDOW_MS + 2000)
    await versionsSettled()
    const [, secondMeta, firstMeta] = useVersions.getState().items
    useDoc.setState({ nodes: [] })

    previewVersion(firstMeta!.id)
    await vi.waitFor(() => expect(useVersions.getState().preview?.id).toBe(firstMeta!.id))
    gated = secondMeta!.id
    previewVersion(secondMeta!.id)
    expect(useVersions.getState().preview?.id).toBe(firstMeta!.id)

    const restoring = restoreVersion(secondMeta!)
    release()
    await restoring
    expect(cardTitles()).toEqual(['API', 'Redis'])
  })

  it('shows that a version could not be read', async () => {
    const memory = memoryVersionStore()
    setVersionStore({ ...memory, load: async () => null })
    const first = diagram(['API'])
    openDiagram(first)
    beginVersions(first)
    await versionsSettled()
    const [opened] = useVersions.getState().items
    previewVersion(opened!.id)
    await vi.waitFor(() => expect(useVersions.getState().previewFailed).toBe(true))
    expect(useVersions.getState().preview).toBeNull()
  })
})
