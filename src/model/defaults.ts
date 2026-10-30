import {
  DIAGRAM_VERSION,
  type CardData,
  type Diagram,
  type DiagramTheme,
  type EdgeData,
  type Flow,
  type GroupData,
  type NodeDetails,
  type PayloadField,
  type ShapeData,
  type TextData,
  type Traffic,
} from './schema'
import type { DiagramEdge } from './types'

const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'
const ID_LENGTH = 10
const UNBIASED_BYTE_LIMIT = 256 - (256 % ID_ALPHABET.length)

export function newId(prefix: string): string {
  let id = ''
  while (id.length < ID_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(ID_LENGTH))) {
      if (byte < UNBIASED_BYTE_LIMIT && id.length < ID_LENGTH) id += ID_ALPHABET[byte % ID_ALPHABET.length]
    }
  }
  return `${prefix}_${id}`
}

export const DEFAULT_TRAFFIC: Traffic = {
  enabled: false,
  direction: 'forward',
  style: 'dots',
  density: 2.2,
  speed: 90,
  size: 1.6,
}

export function defaultEdgeData(overrides: Partial<EdgeData> = {}): EdgeData {
  return {
    path: 'smooth',
    stroke: 'solid',
    width: 1.25,
    label: '',
    labelPosition: 0.5,
    markerStart: 'none',
    markerEnd: 'arrow',
    ports: false,
    sides: 'auto',
    protocol: 'auto',
    traffic: { ...DEFAULT_TRAFFIC },
    ...overrides,
  }
}

export function createEdge(
  source: string,
  target: string,
  overrides: Partial<EdgeData> = {},
  handles: { sourceHandle?: string | null; targetHandle?: string | null } = {},
): DiagramEdge {
  return {
    id: newId('e'),
    type: 'flow',
    source,
    target,
    sourceHandle: handles.sourceHandle ?? null,
    targetHandle: handles.targetHandle ?? null,
    data: defaultEdgeData(overrides),
  }
}

export function emptyDetails(): NodeDetails {
  return { description: '', owner: '', links: [] }
}

export function defaultCardData(overrides: Partial<CardData> = {}): CardData {
  return {
    form: 'service',
    title: 'Service',
    icon: '',
    color: 'neutral',
    lines: [],
    meter: null,
    meterText: '',
    status: 'none',
    badge: '',
    details: emptyDetails(),
    ...overrides,
  }
}

export function defaultShapeData(overrides: Partial<ShapeData> = {}): ShapeData {
  return {
    shape: 'rounded',
    label: 'Shape',
    icon: '',
    color: 'neutral',
    fill: 'tint',
    details: emptyDetails(),
    ...overrides,
  }
}

export function defaultTextData(overrides: Partial<TextData> = {}): TextData {
  return {
    text: 'Text',
    size: 'md',
    tone: 'default',
    align: 'left',
    mono: false,
    ...overrides,
  }
}

export function defaultGroupData(overrides: Partial<GroupData> = {}): GroupData {
  return {
    kind: 'custom',
    label: 'Group',
    detail: '',
    color: 'auto',
    icon: '',
    border: 'dashed',
    tint: true,
    details: emptyDetails(),
    ...overrides,
  }
}

export const DEFAULT_THEME: DiagramTheme = {
  mode: 'auto',
  fonts: 'host',
  background: 'dots',
  snap: true,
  boundaryColors: true,
  protocolColors: true,
  routeAround: false,
}

export function createFlow(name = 'User flow'): Flow {
  return {
    id: newId('f'),
    name,
    steps: [],
    tracks: [],
    token: { label: 'User', icon: 'user', shape: 'chip' },
    spotlight: true,
    loop: false,
    bodies: true,
    cameraStyle: 'frame',
    stepNumbers: false,
    cameraMotion: 'gentle',
  }
}

export function defaultPayloadField(overrides: Partial<PayloadField> = {}): PayloadField {
  return { id: newId('fld'), path: '', type: 'string', required: true, example: '', description: '', ...overrides }
}

export const DEFAULT_DIAGRAM_NAME = 'Untitled diagram'

export function createDiagram(name = DEFAULT_DIAGRAM_NAME): Diagram {
  const now = Date.now()
  return {
    id: newId('d'),
    name,
    version: DIAGRAM_VERSION,
    theme: { ...DEFAULT_THEME },
    nodes: [],
    edges: [],
    flows: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    rev: 0,
    createdAt: now,
    updatedAt: now,
  }
}
