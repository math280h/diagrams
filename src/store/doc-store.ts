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
  /** The `$schema` of the open diagram, if it is not a schema address of the app. */
  $schema?: string
  id: string | null
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
  createdAt: 0,
  rev: 0,
}))

export function takeSnapshot(): DocSnapshot {
  const { name, theme, nodes, edges, flows } = useDoc.getState()
  return { name, theme, nodes, edges, flows }
}
