import { ELEMENT_Z, snapToGrid, sortParentsFirst } from '@/model/graph'
import {
  createDiagram,
  createEdge,
  createFlow,
  defaultCardData,
  defaultGroupData,
  defaultShapeData,
  defaultTextData,
  newId,
} from '@/model/defaults'
import type {
  CardData,
  Diagram,
  EdgeData,
  Flow,
  FlowPath,
  GroupData,
  LogLevel,
  ShapeData,
  Side,
  Step,
  TextData,
} from '@/model/schema'
import type { DiagramEdge, DiagramNode } from '@/model/types'
import { toStoredEdge, toStoredNode } from '@/persistence/serialize'

type CardInput = Partial<Omit<CardData, 'lines'>> & { lines?: string[] }

export class DiagramBuilder {
  readonly nodes: DiagramNode[] = []
  readonly edges: DiagramEdge[] = []
  readonly flows: Flow[] = []

  card(x: number, y: number, input: CardInput, width = 216, parentId?: string): string {
    const id = newId('n')
    const { lines = [], ...rest } = input
    this.nodes.push({
      id,
      type: 'card',
      position: { x, y },
      width,
      parentId,
      zIndex: ELEMENT_Z,
      data: defaultCardData({ ...rest, lines: lines.map((text) => ({ id: newId('l'), text })) }),
    })
    return id
  }

  shape(x: number, y: number, width: number, height: number, input: Partial<ShapeData>, parentId?: string): string {
    const id = newId('n')
    this.nodes.push({
      id,
      type: 'shape',
      position: { x, y },
      width,
      height,
      parentId,
      zIndex: ELEMENT_Z,
      data: defaultShapeData(input),
    })
    return id
  }

  text(x: number, y: number, input: Partial<TextData>, width?: number): string {
    const id = newId('n')
    this.nodes.push({ id, type: 'text', position: { x, y }, width, zIndex: ELEMENT_Z, data: defaultTextData(input) })
    return id
  }

  group(
    x: number,
    y: number,
    width: number,
    height: number,
    { parentId, ...input }: Partial<GroupData> & { parentId?: string },
  ): string {
    const id = newId('n')
    this.nodes.push({
      id,
      type: 'group',
      position: { x, y },
      width,
      height,
      zIndex: -1,
      parentId,
      data: defaultGroupData(input),
    })
    return id
  }

  /**
   * Adds an edge.
   *
   * @param sides - The node sides that the edge attaches to. Without it, the edge uses the sides
   *     that face each other.
   */
  edge(source: string, target: string, data: Partial<EdgeData> = {}, sides?: [Side, Side]): string {
    const edge = sides
      ? createEdge(source, target, { ...data, sides: 'fixed' }, { sourceHandle: sides[0], targetHandle: sides[1] })
      : createEdge(source, target, data)
    this.edges.push(edge)
    return edge.id
  }

  flow(name: string, steps: Omit<Step, 'id'>[], patch: Partial<Omit<Flow, 'id' | 'steps'>> = {}): Flow {
    const flow: Flow = { ...createFlow(name), ...patch, steps: steps.map((step) => ({ ...step, id: newId('s') })) }
    this.flows.push(flow)
    return flow
  }

  /**
   * Adds a path to a flow.
   *
   * @param from - The index of the main step after which the path starts.
   * @param rejoin - The index of the main step where the flow continues after the path. Without it, the flow ends.
   */
  path(flow: Flow, name: string, from: number, steps: Omit<Step, 'id'>[], rejoin?: number) {
    const path: FlowPath = {
      id: newId('p'),
      name,
      fromStep: flow.steps[from]!.id,
      steps: steps.map((step) => ({ ...step, id: newId('s') })),
      rejoinStep: rejoin === undefined ? null : flow.steps[rejoin]!.id,
    }
    flow.paths = [...(flow.paths ?? []), path]
  }

  build(name: string, patch: Partial<Diagram> = {}): Diagram {
    return {
      ...createDiagram(name),
      nodes: sortParentsFirst(this.nodes)
        .map((node) => ({ ...node, position: { x: snapToGrid(node.position.x), y: snapToGrid(node.position.y) } }))
        .map(toStoredNode),
      edges: this.edges.map(toStoredEdge).filter((edge) => edge !== null),
      flows: this.flows,
      ...patch,
    }
  }
}

export interface StepLog {
  event?: string
  latencyMs?: number
  level?: LogLevel
}

function logFields(log: StepLog) {
  return { event: log.event ?? '', latencyMs: log.latencyMs ?? null, level: log.level ?? 'info' }
}

export function nodeStep(
  id: string,
  caption: string,
  durationMs = 1400,
  camera: Step['camera'] = 'follow',
  zoom = 1.1,
  log: StepLog = {},
): Omit<Step, 'id'> {
  return { target: { kind: 'node', id }, caption, durationMs, camera, zoom, ...logFields(log) }
}

export function edgeStep(
  id: string,
  caption = '',
  durationMs = 1300,
  camera: Step['camera'] = 'follow',
  zoom = 1.1,
  log: StepLog = {},
): Omit<Step, 'id'> {
  return { target: { kind: 'edge', id }, caption, durationMs, camera, zoom, ...logFields(log) }
}
