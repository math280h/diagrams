import { z } from '@/lib/zod'
import { COLORS } from './colors'

export const DIAGRAM_VERSION = 16

const colorSchema = z.enum(COLORS)

export const SIDES = ['top', 'right', 'bottom', 'left'] as const
export type Side = (typeof SIDES)[number]

const xySchema = z.object({ x: z.number(), y: z.number() })
export type XY = z.infer<typeof xySchema>

export const cardLineSchema = z.object({ id: z.string(), text: z.string() })

export const nodeLinkSchema = z.object({
  id: z.string(),
  /** The text of the link. An empty string shows the address. */
  label: z.string(),
  url: z.string(),
})
export type NodeLink = z.infer<typeof nodeLinkSchema>

/** What a reader learns about a part on hover in Present and on an exported page. */
export const nodeDetailsSchema = z.object({
  /** Plain text. Addresses in it show as links. */
  description: z.string(),
  /** The team or the person that owns the part. */
  owner: z.string(),
  links: z.array(nodeLinkSchema),
})
export type NodeDetails = z.infer<typeof nodeDetailsSchema>

/** If true, a layout keeps the node in its place and arranges the other nodes around it. */
const pinnedSchema = z.boolean().optional()

/** The id of a diagram that shows the inside of the part, for example the components of a container. */
const opensSchema = z.string().optional()

export const CARD_FORMS = ['service', 'datastore', 'queue', 'client', 'external', 'function'] as const
export type CardForm = (typeof CARD_FORMS)[number]

export const cardDataSchema = z.object({
  /** The kind of system part. The canvas draws each kind with a different outline. */
  form: z.enum(CARD_FORMS),
  title: z.string(),
  /**
   * The icon name: a Lucide name such as `database`, or a set icon such as `aws:lambda` or
   * `logo:postgresql`. An empty string shows no icon.
   */
  icon: z.string(),
  /** A colour that groups nodes, for example one colour for each team or each kind of part. */
  color: colorSchema,
  /**
   * Monospace text lines below the title.
   *
   * Text in braces, for example `{497}`, shows brighter.
   */
  lines: z.array(cardLineSchema),
  /** The fill of the meter, from 0 to 1. The value `null` removes the meter. */
  meter: z.number().min(0).max(1).nullable(),
  /** The text at the end of the meter. An empty string shows the meter value as a percentage. */
  meterText: z.string(),
  status: z.enum(['none', 'ok', 'warn', 'error']),
  badge: z.string(),
  details: nodeDetailsSchema,
  pinned: pinnedSchema,
  opens: opensSchema,
})
export type CardData = z.infer<typeof cardDataSchema>

export const SHAPES = [
  'rectangle',
  'rounded',
  'pill',
  'circle',
  'diamond',
  'hexagon',
  'cylinder',
  'parallelogram',
] as const
export const shapeDataSchema = z.object({
  shape: z.enum(SHAPES),
  label: z.string(),
  icon: z.string(),
  color: colorSchema,
  fill: z.enum(['tint', 'solid', 'outline']),
  details: nodeDetailsSchema,
  pinned: pinnedSchema,
})
export type ShapeData = z.infer<typeof shapeDataSchema>
export type ShapeKind = ShapeData['shape']

export const textDataSchema = z.object({
  text: z.string(),
  size: z.enum(['sm', 'md', 'lg', 'xl']),
  tone: z.enum(['default', 'muted']),
  align: z.enum(['left', 'center', 'right']),
  mono: z.boolean(),
  pinned: pinnedSchema,
})
export type TextData = z.infer<typeof textDataSchema>

export const groupDataSchema = z.object({
  /** The id of a boundary kind in `BOUNDARY_KINDS`, for example `aws.account`. */
  kind: z.string(),
  label: z.string(),
  /** A short fact under the kind, for example an account id or an address range. */
  detail: z.string(),
  /** With `auto`, the boundary uses the colour of its kind. */
  color: z.enum(['auto', ...COLORS]),
  icon: z.string(),
  border: z.enum(['dashed', 'solid', 'none']),
  tint: z.boolean(),
  details: nodeDetailsSchema,
  pinned: pinnedSchema,
  opens: opensSchema,
})
export type GroupData = z.infer<typeof groupDataSchema>

const nodeBase = {
  id: z.string(),
  position: xySchema,
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  measured: z.object({ width: z.number(), height: z.number() }).partial().optional(),
  parentId: z.string().optional(),
  zIndex: z.number().optional(),
}

export const storedNodeSchema = z.discriminatedUnion('type', [
  z.object({ ...nodeBase, type: z.literal('card'), data: cardDataSchema }),
  z.object({ ...nodeBase, type: z.literal('shape'), data: shapeDataSchema }),
  z.object({ ...nodeBase, type: z.literal('text'), data: textDataSchema }),
  z.object({ ...nodeBase, type: z.literal('group'), data: groupDataSchema }),
])
export type StoredNode = z.infer<typeof storedNodeSchema>

export const trafficSchema = z.object({
  enabled: z.boolean(),
  direction: z.enum(['forward', 'reverse', 'both']),
  style: z.enum(['dots', 'comets', 'dashes', 'pulse']),
  /** The number of particles for each 100 canvas pixels of path length. */
  density: z.number().min(0.1).max(10),
  /** The distance that one particle moves in one second, in canvas pixels. */
  speed: z.number().min(5).max(2000),
  /** The particle radius in canvas pixels. */
  size: z.number().min(0.5).max(6),
})
export type Traffic = z.infer<typeof trafficSchema>

export const PAYLOAD_TYPES = ['string', 'number', 'boolean', 'object', 'array', 'null'] as const
export type PayloadType = (typeof PAYLOAD_TYPES)[number]

export const SENSITIVE_KINDS = ['personal', 'secret'] as const
export type SensitiveKind = (typeof SENSITIVE_KINDS)[number]

export const payloadFieldSchema = z.object({
  id: z.string(),
  /**
   * The place of the field in the body. Dots separate the names of nested fields, and `[]` marks the items of an
   * array, for example `customer.email` or `items[].sku`. A path that starts with `[]` describes a body that is an
   * array.
   */
  path: z.string(),
  type: z.enum(PAYLOAD_TYPES),
  required: z.boolean(),
  /** An example value as text, for example `A-1` or `2`. Objects, arrays and `null` do not use it. */
  example: z.string(),
  description: z.string(),
  /**
   * Marks a field that holds personal data, such as an email address, or a secret, such as a password or a token.
   * Without it, the field holds neither.
   */
  sensitive: z.enum(SENSITIVE_KINDS).optional(),
})
export type PayloadField = z.infer<typeof payloadFieldSchema>

/** A JSON body that a connection carries, as a list of fields. */
export const payloadSchema = z.object({ fields: z.array(payloadFieldSchema) })
export type Payload = z.infer<typeof payloadSchema>

export const MARKERS = ['none', 'arrow', 'dot'] as const
export const EDGE_PROTOCOLS = ['auto', 'http', 'rpc', 'data', 'messaging', 'none'] as const
export const edgeDataSchema = z.object({
  path: z.enum(['bezier', 'smooth', 'step', 'straight']),
  stroke: z.enum(['solid', 'dashed', 'dotted']),
  width: z.number().min(0.5).max(8),
  label: z.string(),
  /** The label location as a fraction of the path length, from 0 to 1. */
  labelPosition: z.number().min(0).max(1),
  markerStart: z.enum(MARKERS),
  markerEnd: z.enum(MARKERS),
  /** If true, the edge shows a port mark at each node it touches. */
  ports: z.boolean(),
  /** With `auto`, the edge attaches to the node sides that face each other. */
  sides: z.enum(['auto', 'fixed']),
  /** The protocol that sets the edge colour. With `auto`, the label names it, for example `gRPC`. */
  protocol: z.enum(EDGE_PROTOCOLS),
  traffic: trafficSchema,
  /**
   * The path of the last automatic layout, in canvas coordinates, from the source node to the target node.
   *
   * An edge with automatic sides follows it while its ends still touch both nodes.
   */
  route: z.array(xySchema).optional(),
  /**
   * The corners of a route that a person drew, in canvas coordinates. When the diagram routes edges around nodes, a
   * `smooth` or `step` edge with corners goes through them at right angles, and its ends attach to its nodes wherever
   * they are.
   */
  bends: z.array(xySchema).optional(),
  /** The body that the source sends to the target. */
  request: payloadSchema.optional(),
  /** The body that the target sends back to the source. */
  response: payloadSchema.optional(),
})
export type EdgeData = z.infer<typeof edgeDataSchema>

export const storedEdgeSchema = z.object({
  id: z.string(),
  type: z.literal('flow'),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
  zIndex: z.number().optional(),
  data: edgeDataSchema,
})
export type StoredEdge = z.infer<typeof storedEdgeSchema>

export const targetSchema = z.object({ kind: z.enum(['node', 'edge']), id: z.string() })
export type Target = z.infer<typeof targetSchema>

/**
 * The target of a step: a node, an edge, or the whole flow. A step on the whole flow is an overview: it shows all the
 * nodes and edges of the path, for example as an introduction before the first step or a conclusion after the last.
 */
export const stepTargetSchema = z.union([targetSchema, z.object({ kind: z.literal('flow'), id: z.literal('') })])
export type StepTarget = z.infer<typeof stepTargetSchema>

export const LOG_LEVELS = ['info', 'warn', 'error'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]

export const stepSchema = z.object({
  id: z.string(),
  target: stepTargetSchema,
  caption: z.string(),
  /** The text of the log line, for example `POST /orders`. An empty string shows the edge label. */
  event: z.string(),
  /** The request time that the log line shows. The value `null` shows no time. */
  latencyMs: z.number().min(0).nullable(),
  level: z.enum(LOG_LEVELS),
  durationMs: z.number().min(100).max(60_000),
  camera: z.enum(['follow', 'fit', 'hold']),
  zoom: z.number().min(0.1).max(4),
  /** Other nodes or edges that the step reaches at the same time as `target`. Each one gets its own token. */
  parallel: z.array(targetSchema).optional(),
})
export type Step = z.infer<typeof stepSchema>

/**
 * A different way through the flow, for example the steps after a failed payment.
 *
 * The path starts after the step `fromStep` of the main steps and takes the place of the main steps after it.
 */
export const flowPathSchema = z.object({
  id: z.string(),
  name: z.string(),
  fromStep: z.string(),
  steps: z.array(stepSchema),
  /** A later main step where the flow continues after the path. With `null`, the flow ends after the path. */
  rejoinStep: z.string().nullable(),
})
export type FlowPath = z.infer<typeof flowPathSchema>

export const easeSchema = z.enum(['linear', 'inOut', 'hold'])
export type Ease = z.infer<typeof easeSchema>

export const cameraKeyframeSchema = z.object({
  id: z.string(),
  atMs: z.number().min(0),
  ease: easeSchema,
  x: z.number(),
  y: z.number(),
  zoom: z.number().min(0.1).max(4),
})
export type CameraKeyframe = z.infer<typeof cameraKeyframeSchema>

export const valueKeyframeSchema = z.object({
  id: z.string(),
  atMs: z.number().min(0),
  ease: easeSchema,
  value: z.number().min(0).max(1),
})
export type ValueKeyframe = z.infer<typeof valueKeyframeSchema>

export const trackSchema = z.discriminatedUnion('kind', [
  z.object({ id: z.string(), kind: z.literal('camera'), keyframes: z.array(cameraKeyframeSchema) }),
  z.object({
    id: z.string(),
    kind: z.literal('emphasis'),
    target: targetSchema,
    keyframes: z.array(valueKeyframeSchema),
  }),
  z.object({
    id: z.string(),
    kind: z.literal('traffic'),
    target: targetSchema,
    keyframes: z.array(valueKeyframeSchema),
  }),
])
export type Track = z.infer<typeof trackSchema>

export const tokenSchema = z.object({
  label: z.string(),
  icon: z.string(),
  shape: z.enum(['dot', 'chip']),
})

export const CAMERA_MOTIONS = ['gentle', 'quick', 'slow'] as const
export type CameraMotion = (typeof CAMERA_MOTIONS)[number]

/**
 * How the camera of a flow moves: `frame` gives each step a frame and moves only when it must, `follow` tracks the
 * token at the zoom of each step, and `still` shows the whole diagram and does not move.
 */
export const CAMERA_STYLES = ['frame', 'follow', 'still'] as const
export type CameraStyle = (typeof CAMERA_STYLES)[number]

export const flowSchema = z.object({
  id: z.string(),
  name: z.string(),
  steps: z.array(stepSchema),
  tracks: z.array(trackSchema),
  token: tokenSchema,
  /** If true, the player dims the elements that the flow did not reach. */
  spotlight: z.boolean(),
  loop: z.boolean(),
  /**
   * If true, the log line of an edge step shows the request body of the edge, or the response body while the token
   * moves back.
   */
  bodies: z.boolean(),
  cameraStyle: z.enum(CAMERA_STYLES),
  /** If true, the canvas numbers the previous, the current and the next step while the flow plays. */
  stepNumbers: z.boolean(),
  /** The speed and ease of the camera moves between step frames. */
  cameraMotion: z.enum(CAMERA_MOTIONS),
  paths: z.array(flowPathSchema).optional(),
})
export type Flow = z.infer<typeof flowSchema>

export const FONT_PAIRS = ['host', 'atkinson', 'inter', 'plex'] as const
export const themeSchema = z.object({
  /** With `auto`, the canvas uses the theme of the application. */
  mode: z.enum(['auto', 'dark', 'light']),
  fonts: z.enum(FONT_PAIRS),
  background: z.enum(['dots', 'grid', 'none']),
  snap: z.boolean(),
  /** If false, all boundaries use the neutral colour. */
  boundaryColors: z.boolean(),
  /** If false, all edges use the neutral colour. */
  protocolColors: z.boolean(),
  /** If true, `smooth` and `step` edges go around the other nodes, and a person can set their routes by hand. */
  routeAround: z.boolean(),
})
export type DiagramTheme = z.infer<typeof themeSchema>

export const viewportSchema = z.object({ x: z.number(), y: z.number(), zoom: z.number() })

export const diagramSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.literal(DIAGRAM_VERSION),
  theme: themeSchema,
  nodes: z.array(storedNodeSchema),
  edges: z.array(storedEdgeSchema),
  flows: z.array(flowSchema),
  viewport: viewportSchema,
  /**
   * The save counter.
   *
   * A higher value in storage than in memory shows an edit from a different tab.
   */
  rev: z.number().int().min(0),
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type Diagram = z.infer<typeof diagramSchema>
