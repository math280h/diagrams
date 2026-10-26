import {
  BOUNDARY_KINDS,
  BOUNDARY_PROVIDERS,
  TINTED_TIERS,
  boundaryKindLabel,
  type BoundaryKind,
  type BoundaryProvider,
  type BoundaryTier,
} from './boundaries'
import { ELEMENT_Z } from './graph'
import { matchKeywords } from './keywords'
import { defaultCardData, defaultGroupData, defaultShapeData, defaultTextData, newId } from './defaults'
import type { CardData, CardForm, ShapeKind, TextData, XY } from './schema'
import type { DiagramNode } from './types'

export type PresetCategory = 'architecture' | 'flow' | 'shapes' | 'annotate' | BoundaryProvider

export const PRESET_CATEGORIES: { id: PresetCategory; label: string }[] = [
  { id: 'architecture', label: 'Architecture' },
  { id: 'flow', label: 'User flow' },
  ...BOUNDARY_PROVIDERS.map((provider) => ({ id: provider.id, label: provider.name })),
  { id: 'shapes', label: 'Shapes' },
  { id: 'annotate', label: 'Annotate' },
]

export const BOUNDARY_SIZE: Record<BoundaryTier, { width: number; height: number }> = {
  scope: { width: 640, height: 416 },
  logical: { width: 480, height: 320 },
  location: { width: 576, height: 384 },
  zone: { width: 304, height: 256 },
  network: { width: 512, height: 336 },
  subnet: { width: 272, height: 208 },
  security: { width: 304, height: 224 },
  runtime: { width: 448, height: 304 },
  custom: { width: 416, height: 256 },
}

function boundary(kind: BoundaryKind): Preset {
  const custom = kind.tier === 'custom'
  return {
    id: `boundary:${kind.id}`,
    label: custom ? 'Group' : boundaryKindLabel(kind),
    category: kind.provider,
    icon: kind.icon || 'group',
    keywords: kind.keywords,
    create: (position) => ({
      id: newId('n'),
      type: 'group',
      position,
      ...BOUNDARY_SIZE[kind.tier],
      zIndex: -1,
      data: defaultGroupData({
        kind: kind.id,
        label: custom ? 'Group' : '',
        icon: kind.icon,
        tint: TINTED_TIERS.has(kind.tier),
      }),
    }),
  }
}

export interface Preset {
  id: string
  label: string
  category: PresetCategory
  icon: string
  /** Words that select this preset for a Mermaid label or a palette search. */
  keywords: string[]
  create: (position: XY) => DiagramNode
}

function card(
  id: string,
  label: string,
  icon: string,
  keywords: string[],
  data: Partial<CardData> = {},
  category: PresetCategory = 'architecture',
): Preset {
  return {
    id,
    label,
    category,
    icon,
    keywords,
    create: (position) => ({
      id: newId('n'),
      type: 'card',
      position,
      width: 216,
      zIndex: ELEMENT_Z,
      data: defaultCardData({ title: label, ...data }),
    }),
  }
}

export function defaultShapeSize(kind: ShapeKind): { width: number; height: number } {
  const square = kind === 'circle' || kind === 'diamond' || kind === 'hexagon'
  return { width: square ? 128 : 168, height: square ? 128 : kind === 'cylinder' ? 112 : 72 }
}

function shape(
  id: string,
  label: string,
  kind: ShapeKind,
  icon: string,
  keywords: string[],
  category: PresetCategory = 'shapes',
): Preset {
  return {
    id,
    label,
    category,
    icon,
    keywords,
    create: (position) => ({
      id: newId('n'),
      type: 'shape',
      position,
      ...defaultShapeSize(kind),
      zIndex: ELEMENT_Z,
      data: defaultShapeData({ shape: kind, label }),
    }),
  }
}

function textPreset(id: string, label: string, icon: string, data: Partial<TextData>): Preset {
  return {
    id,
    label,
    category: 'annotate',
    icon,
    keywords: ['text', 'label', 'note'],
    create: (position) => ({
      id: newId('n'),
      type: 'text',
      position,
      zIndex: ELEMENT_Z,
      data: defaultTextData(data),
    }),
  }
}

export const PRESETS: Preset[] = [
  card('client', 'Browser', 'monitor', ['client', 'browser', 'web', 'frontend'], { form: 'client' }),
  card('user', 'User', 'user', ['user', 'person', 'customer', 'actor'], { form: 'client' }),
  card('mobile', 'Mobile app', 'smartphone', ['mobile', 'ios', 'android', 'phone', 'app'], { form: 'client' }),
  card('webapp', 'Web app', 'app-window', ['webapp', 'spa', 'site', 'ui'], { form: 'client' }),
  card('gateway', 'API gateway', 'door-open', ['gateway', 'ingress', 'edge', 'proxy']),
  card('lb', 'Load balancer', 'split', ['load balancer', 'lb', 'balancer', 'nginx', 'haproxy']),
  card('service', 'Service', 'server', ['service', 'server', 'api', 'backend', 'app']),
  card('worker', 'Worker', 'cpu', ['worker', 'job', 'consumer', 'processor']),
  card('function', 'Function', 'zap', ['function', 'lambda', 'serverless', 'faas'], { form: 'function' }),
  card('container', 'Container', 'box', ['container', 'docker', 'pod', 'k8s', 'kubernetes']),
  card('database', 'Database', 'database', ['database', 'db', 'postgres', 'mysql', 'sql', 'mongo', 'replica'], {
    form: 'datastore',
  }),
  card('cache', 'Cache', 'memory-stick', ['cache', 'redis', 'memcached', 'kv'], { form: 'datastore' }),
  card('queue', 'Queue', 'layers', ['queue', 'sqs', 'rabbitmq', 'broker', 'topic'], { form: 'queue' }),
  card('stream', 'Event stream', 'waves', ['stream', 'kafka', 'kinesis', 'events', 'bus'], { form: 'queue' }),
  card('storage', 'Object storage', 'hard-drive', ['storage', 's3', 'blob', 'bucket', 'files'], { form: 'datastore' }),
  card('cdn', 'CDN', 'globe', ['cdn', 'cloudfront', 'edge cache', 'static']),
  card('auth', 'Auth', 'shield-check', ['auth', 'identity', 'login', 'oauth', 'sso', 'iam']),
  card('search', 'Search', 'search', ['search', 'elastic', 'index', 'opensearch'], { form: 'datastore' }),
  card('ai', 'AI model', 'sparkles', ['ai', 'llm', 'model', 'ml', 'inference']),
  card('external', 'External API', 'plug', ['external', 'third party', 'vendor', 'webhook'], { form: 'external' }),
  card('payments', 'Payments', 'credit-card', ['payment', 'stripe', 'billing', 'checkout'], { form: 'external' }),
  card('email', 'Email provider', 'mail', ['email', 'mail', 'smtp', 'notification'], { form: 'external' }),
  card('monitoring', 'Monitoring', 'activity', ['monitoring', 'metrics', 'logs', 'observability']),
  card('cron', 'Scheduler', 'clock', ['cron', 'scheduler', 'timer', 'batch'], { form: 'function' }),
  card('cloud', 'Cloud service', 'cloud', ['cloud', 'aws', 'gcp', 'azure'], { form: 'external' }),

  card('screen', 'Screen', 'panel-top', ['screen', 'page', 'view'], { form: 'client' }, 'flow'),
  card('action', 'Action', 'mouse-pointer-click', ['action', 'click', 'tap', 'submit'], { form: 'function' }, 'flow'),
  card('form', 'Form', 'text-cursor-input', ['form', 'input', 'field'], { form: 'client' }, 'flow'),
  card('notify', 'Notification', 'bell', ['notification', 'push', 'alert'], { form: 'external' }, 'flow'),
  shape('decision', 'Decision', 'diamond', 'diamond', ['decision', 'if', 'choice', 'branch'], 'flow'),
  shape('start', 'Start', 'pill', 'play', ['start', 'begin', 'entry'], 'flow'),
  shape('end', 'End', 'pill', 'flag', ['end', 'finish', 'exit', 'done'], 'flow'),

  shape('rectangle', 'Rectangle', 'rectangle', 'square', ['rectangle', 'box']),
  shape('rounded', 'Rounded', 'rounded', 'square-dashed', ['rounded']),
  shape('pill', 'Pill', 'pill', 'pill', ['pill', 'stadium']),
  shape('circle', 'Circle', 'circle', 'circle', ['circle']),
  shape('diamond', 'Diamond', 'diamond', 'diamond', ['diamond', 'rhombus']),
  shape('hexagon', 'Hexagon', 'hexagon', 'hexagon', ['hexagon']),
  shape('cylinder', 'Cylinder', 'cylinder', 'cylinder', ['cylinder', 'disk']),
  shape('parallelogram', 'Parallelogram', 'parallelogram', 'rectangle-horizontal', ['parallelogram', 'io']),

  textPreset('heading', 'Heading', 'heading', { text: 'Heading', size: 'xl' }),
  textPreset('text', 'Text', 'type', { text: 'Text', size: 'md' }),
  textPreset('caption', 'Caption', 'text', { text: 'Caption', size: 'sm', tone: 'muted', mono: true }),
  ...BOUNDARY_KINDS.map(boundary),
]

export const PRESET_BY_ID = new Map(PRESETS.map((preset) => [preset.id, preset]))

const MATCHABLE_PRESETS = PRESETS.filter((preset) => preset.category === 'architecture' || preset.category === 'flow')

/**
 * Returns the preset whose keywords match the label best.
 *
 * @returns The matched preset, or `undefined` if no keyword occurs in the label.
 */
export function matchPreset(label: string): Preset | undefined {
  return matchKeywords(label, MATCHABLE_PRESETS)
}

export const CARD_FORM_LABELS: Record<CardForm, string> = {
  service: 'Service',
  datastore: 'Data store',
  queue: 'Queue or stream',
  client: 'Client',
  external: 'External system',
  function: 'Function or job',
}
