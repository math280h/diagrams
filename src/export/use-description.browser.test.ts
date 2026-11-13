import { act, createElement, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultCardData } from '@/model/defaults'
import type { CardNodeType } from '@/model/types'
import { useDoc } from '@/store/doc-store'
import type { DiagramDescription } from './describe'
import { useDiagramDescription } from './use-description'

// React writes a warning for each act() call if IS_REACT_ACT_ENVIRONMENT is not true.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function card(title: string, x: number, dragging = false): CardNodeType {
  return { id: title, type: 'card', position: { x, y: 0 }, data: defaultCardData({ title }), dragging }
}

function parts(description: DiagramDescription | null): string[] {
  return description?.sections.find((section) => section.title === 'Parts')?.items ?? []
}

let root: Root | null = null
let shown: DiagramDescription | null = null

function Probe() {
  const description = useDiagramDescription()
  useEffect(() => {
    shown = description
  })
  return null
}

async function setNodes(nodes: CardNodeType[]) {
  await act(async () => useDoc.setState({ nodes }))
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  shown = null
  useDoc.setState({ name: '', nodes: [], edges: [], flows: [] })
})

describe('useDiagramDescription', () => {
  it('keeps the reading order during a node drag and follows it when the drag ends', async () => {
    useDoc.setState({ name: 'Shop', nodes: [card('API', 0), card('Postgres', 300)], edges: [], flows: [] })
    root = createRoot(document.body.appendChild(document.createElement('div')))
    await act(async () => root!.render(createElement(Probe)))
    const before = shown
    expect(parts(before)[0]).toMatch(/^API/)

    await setNodes([card('API', 600, true), card('Postgres', 300)])
    expect(shown).toBe(before)

    await setNodes([card('API', 600), card('Postgres', 300)])
    expect(parts(shown)[0]).toMatch(/^Postgres/)
  })
})
