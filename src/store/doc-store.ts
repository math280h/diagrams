import { create } from 'zustand'
import { DEFAULT_THEME } from '@/model/defaults'
import type { DiagramTheme, Flow } from '@/model/schema'
import type { DiagramEdge, DiagramNode } from '@/model/types'

export interface DocSnapshot {
  name: string
  theme: DiagramTheme
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  flows: Flow[]
}

export interface DocState extends DocSnapshot {
  id: string | null
  viewport: { x: number; y: number; zoom: number }
  createdAt: number
  /** The `rev` value of the last save or load. */
  rev: number
}

export const useDoc = create<DocState>(() => ({
  id: null,
  name: '',
  theme: DEFAULT_THEME,
  nodes: [],
  edges: [],
  flows: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  createdAt: 0,
  rev: 0,
}))

export function takeSnapshot(): DocSnapshot {
  const { name, theme, nodes, edges, flows } = useDoc.getState()
  return { name, theme, nodes, edges, flows }
}
