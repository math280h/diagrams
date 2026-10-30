import { z } from 'zod'
import { LAYOUT_DIRECTIONS } from '@/layout/types'
import { BOUNDARY_PROVIDER_IDS } from '@/model/boundaries'
import { COLORS } from '@/model/colors'
import {
  CAMERA_MOTIONS,
  CAMERA_STYLES,
  CARD_FORMS,
  EDGE_PROTOCOLS,
  FONT_PAIRS,
  LOG_LEVELS,
  PAYLOAD_TYPES,
  SENSITIVE_KINDS,
  SHAPES,
  SIDES,
} from '@/model/schema'

const NODE_KINDS = ['card', 'shape', 'text', 'group'] as const
const PROVIDERS = ['aws', 'azure', 'gcp', 'k8s', 'logo', 'salesforce', 'lucide'] as const

const diagramId = z
  .string()
  .optional()
  .describe('The diagram id. Leave it out to use the diagram that is open in the editor.')

const nodeRef = (what: string) =>
  z.string().describe(`${what}: a node id, a ref from this call, or the node label if no other node has it.`)

const edgeRef = z
  .string()
  .describe('An edge: its id, "From -> To" with node labels, refs or ids, or its label if no other edge has it.')

const nodeFields = {
  label: z.string().describe('The card title, shape label, text, or group name. Write it in sentence case.'),
  form: z
    .enum(CARD_FORMS)
    .optional()
    .describe(
      'Cards only. The kind of system part, which sets the outline: service, datastore, queue, client, external or function.',
    ),
  icon: z
    .string()
    .optional()
    .describe(
      'A Lucide icon name such as "database", or a set icon from search_icons such as "aws:lambda" or "logo:postgresql". An empty string removes the icon.',
    ),
  lines: z
    .array(z.string())
    .optional()
    .describe(
      'Cards only. Short lines under the title, for example a port or an engine version. A line that reads as an identifier, such as a host, path or port, shows in monospace. Text in braces, such as {497}, shows brighter.',
    ),
  badge: z.string().optional().describe('Cards only. A short tag in the corner, for example a version.'),
  color: z
    .enum([...COLORS, 'auto'])
    .optional()
    .describe(
      'Cards, shapes and groups. A colour that groups nodes, for example one colour for each team or each kind of part. Cards and shapes are neutral (grey) by default. A group uses the colour of its boundary kind with auto, the default.',
    ),
  status: z.enum(['none', 'ok', 'warn', 'error']).optional().describe('Cards only. A status dot.'),
  shape: z.enum(SHAPES).optional().describe('Shapes only. The outline of the shape.'),
  textSize: z.enum(['sm', 'md', 'lg', 'xl']).optional().describe('Text only. The text size.'),
  boundary: z
    .string()
    .optional()
    .describe(
      'Groups only. A boundary kind from list_boundary_kinds, for example "aws.vpc" or "k8s.namespace". The default is "custom".',
    ),
  detail: z
    .string()
    .optional()
    .describe('Groups only. A short fact under the name, for example an account id or an address range.'),
  description: z
    .string()
    .optional()
    .describe(
      'Cards, shapes and groups. Plain text about what the part does. Readers see it when they point at the node in Present and on an exported web page. Addresses in it show as links.',
    ),
  owner: z.string().optional().describe('Cards, shapes and groups. The team or the person that owns the part.'),
  links: z
    .array(
      z.object({
        label: z
          .string()
          .optional()
          .describe('The link text, for example "Runbook". Leave it out to show the address.'),
        url: z.string().describe('A web address (https://) or a mail address (mailto:).'),
      }),
    )
    .optional()
    .describe(
      'Cards, shapes and groups. Links to the code, docs, runbook or dashboard of the part. They replace the links of the node.',
    ),
  opens: z
    .string()
    .nullable()
    .optional()
    .describe(
      'Cards and groups. The id of a diagram that shows the inside of the part, for example the components of a container. The node gets a zoom button, and in Present readers zoom into it. null removes the link.',
    ),
  pinned: z
    .boolean()
    .optional()
    .describe(
      'If true, layout_diagram and Tidy up keep the node in its place and arrange the other nodes around it. Pin nodes that the user placed by hand.',
    ),
  x: z
    .number()
    .optional()
    .describe('The left edge in canvas pixels. Leave out x and y to place the node automatically.'),
  y: z.number().optional().describe('The top edge in canvas pixels.'),
  width: z.number().positive().optional().describe('The width in canvas pixels.'),
  height: z.number().positive().optional().describe('The height in canvas pixels. Cards set their own height.'),
}

const nodeInput = z.object({
  ref: z
    .string()
    .optional()
    .describe('A name for this node that edges, parents and flow steps in the same call can use.'),
  kind: z.enum(NODE_KINDS).optional().describe('card (the default), shape, text or group. A group is a boundary.'),
  ...nodeFields,
  parent: nodeRef('The group that holds this node').optional(),
})

const nodePatch = z.object({
  node: nodeRef('The node to change'),
  ...nodeFields,
  label: nodeFields.label.optional(),
  parent: nodeRef('The new parent group')
    .nullable()
    .optional()
    .describe('The new parent group: a ref, id or unique label. The value null moves the node to the top level.'),
})

const payloadField = z.object({
  path: z
    .string()
    .describe(
      'The field name. Use dots for nested fields and [] for array items, for example "customer.email" or "items[].sku". Start with [] if the body is an array.',
    ),
  type: z.enum(PAYLOAD_TYPES).optional().describe('string (the default), number, boolean, object, array or null.'),
  required: z.boolean().optional().describe('If false, the body can leave the field out. The default is true.'),
  example: z
    .union([z.string(), z.number(), z.boolean()])
    .optional()
    .describe('An example value, for example "LAMP-01" or 2.'),
  description: z.string().optional().describe('One short sentence about what the field holds.'),
  sensitive: z
    .enum(SENSITIVE_KINDS)
    .nullable()
    .optional()
    .describe(
      'Marks the field as "personal" data (a name, an email or postal address, a phone number, an IP address, a user id) or as a "secret" (a password, a token, an API key, a card number). null removes the mark.',
    ),
})

const payloadInput = z
  .object({
    example: z
      .unknown()
      .optional()
      .describe(
        'An example JSON body: an object or an array. It replaces the fields with the fields, types and example values that it holds. Fields with the same path keep their description.',
      ),
    fields: z
      .array(payloadField)
      .optional()
      .describe(
        'Fields to change by path, or to add. Use it to add descriptions, or to describe a body without an example.',
      ),
    remove: z.array(z.string()).optional().describe('The paths of fields to remove.'),
  })
  .nullable()
  .optional()

const edgeFields = {
  label: z
    .string()
    .optional()
    .describe(
      'Name the protocol or the call, for example "HTTPS", "gRPC", "SQL" or "publish order.created". The label sets the edge colour.',
    ),
  protocol: z
    .enum(EDGE_PROTOCOLS)
    .optional()
    .describe('The protocol colour. Leave it out to read the protocol from the label.'),
  style: z
    .enum(['solid', 'dashed', 'dotted'])
    .optional()
    .describe('The line style. Dashed suits async or optional calls.'),
  path: z
    .enum(['smooth', 'step', 'straight', 'bezier'])
    .optional()
    .describe('smooth (the default) routes at right angles with round corners.'),
  traffic: z.boolean().optional().describe('If true, particles move along the edge all the time.'),
  bidirectional: z.boolean().optional().describe('If true, the edge has an arrow at both ends.'),
  fromSide: z
    .enum([...SIDES, 'auto'])
    .optional()
    .describe('The side of the source node that the edge leaves from. "auto" lets the app choose the sides again.'),
  toSide: z
    .enum([...SIDES, 'auto'])
    .optional()
    .describe('The side of the target node that the edge enters. "auto" lets the app choose the sides again.'),
  request: payloadInput.describe(
    'The JSON body that the source sends, for example the body of a POST request or of a message. A flow shows it in the log line while the token moves along the edge. null removes it.',
  ),
  response: payloadInput.describe(
    'The JSON body that the target sends back. A flow shows it while the token moves back along the edge. null removes it.',
  ),
}

const edgeInput = z.object({
  from: nodeRef('The source node'),
  to: nodeRef('The target node'),
  ...edgeFields,
})

const edgePatch = z.object({
  edge: edgeRef,
  from: nodeRef('A new source node').optional(),
  to: nodeRef('A new target node').optional(),
  ...edgeFields,
})

const stepInput = z.object({
  target: z
    .string()
    .optional()
    .describe(
      'The node or edge of the step. Use "A -> B" for an edge. A node id, ref or unique label selects a node. Leave it out for an overview step.',
    ),
  overview: z
    .boolean()
    .optional()
    .describe(
      'If true, the step shows the whole flow and needs no target: as the first step it is the introduction, as the last step the conclusion.',
    ),
  caption: z.string().optional().describe('One short sentence that the presenter shows for this step.'),
  event: z
    .string()
    .optional()
    .describe('The log line of the step, for example "POST /orders" or "INSERT orders". Empty uses the edge label.'),
  latencyMs: z.number().min(0).optional().describe('The time that the log line shows, in milliseconds.'),
  level: z.enum(LOG_LEVELS).optional().describe('info (the default), warn or error. It colours the log line.'),
  durationMs: z.number().min(100).max(60_000).optional().describe('How long the step plays, in milliseconds.'),
  camera: z
    .enum(['follow', 'fit', 'hold'])
    .optional()
    .describe(
      'follow (the default) keeps the step in view with the camera of the flow. fit centres on the node or edge of the step and zooms in. hold keeps the last view.',
    ),
  zoom: z.number().min(0.1).max(4).optional().describe('The largest camera zoom for the step.'),
  parallel: z
    .array(z.string())
    .optional()
    .describe(
      'Other nodes or edges that the step reaches at the same time, each with its own token, for example all consumers of one event. With connect, a node step gets one edge step that reaches all its nodes at once.',
    ),
})

const pathInput = z.object({
  name: z.string().describe('The path name, for example "Card declined".'),
  from: z.number().int().min(0).describe('The index from 0 of the main step after which the path starts.'),
  steps: z.array(stepInput).describe('The steps that the flow plays in place of the main steps after "from".'),
  rejoin: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('The index of a later main step where the flow continues after the path. Without it, the flow ends.'),
})

const flowOptions = {
  token: z
    .object({
      label: z.string().optional().describe('The text on the moving token, for example "Order" or "User".'),
      icon: z.string().optional().describe('An icon name for the token, as for nodes.'),
    })
    .optional(),
  spotlight: z.boolean().optional().describe('If true, elements that the flow did not reach yet look dim.'),
  loop: z.boolean().optional().describe('If true, the flow starts again at the end.'),
  stepNumbers: z
    .boolean()
    .optional()
    .describe('If true, the diagram shows the numbers of the previous, the current and the next step.'),
  cameraStyle: z
    .enum(CAMERA_STYLES)
    .optional()
    .describe(
      'frame (the default) gives each step a frame and moves only when it must, follow tracks the token, still shows the whole diagram and does not move.',
    ),
  cameraMotion: z
    .enum(CAMERA_MOTIONS)
    .optional()
    .describe('With the frame camera, how the camera moves between step frames: gentle (the default), quick or slow.'),
  bodies: z
    .boolean()
    .optional()
    .describe(
      'If true (the default), the log line of an edge step shows the request body of the edge, or its response body when the token moves back.',
    ),
  connect: z
    .boolean()
    .optional()
    .describe(
      'If true (the default), steps between two nodes get the edge steps of the shortest connection between them.',
    ),
}

const flowPaths = z
  .array(pathInput)
  .optional()
  .describe(
    'Alternate paths, for example an error path. The player and the exports play one path at a time. On update_flow, the list replaces all paths.',
  )

const flowRef = z.string().describe('The flow: its id or its name.')

export interface ToolDefinition {
  title: string
  description: string
  input: z.ZodObject
  annotations: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean }
  timeoutMs: number
}

const READ = { readOnlyHint: true } as const
const ADD = { readOnlyHint: false, destructiveHint: false } as const
const CHANGE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true } as const
const SHORT_MS = 20_000
const LONG_MS = 90_000

export const TOOL_DEFINITIONS = {
  list_diagrams: {
    title: 'List diagrams',
    description:
      'List the saved diagrams with their ids, names, node and flow counts, last change, and which one is open in the editor.',
    input: z.object({ query: z.string().optional().describe('Only list diagrams whose name contains this text.') }),
    annotations: READ,
    timeoutMs: SHORT_MS,
  },
  get_editor_state: {
    title: 'Get editor state',
    description:
      'Get what the user looks at: the open diagram, the selected nodes and edges, and the flow that is open in the flows panel. Call it when the user says "this" or "the selected one".',
    input: z.object({}),
    annotations: READ,
    timeoutMs: SHORT_MS,
  },
  get_diagram: {
    title: 'Get diagram',
    description:
      'Read a diagram: nodes with labels, kinds, icons, parents and canvas rectangles, edges with labels, protocols and request and response bodies, and flows. Also warns about overlapping nodes.',
    input: z.object({
      diagramId,
      detail: z
        .enum(['outline', 'full'])
        .optional()
        .describe('outline (the default) leaves out card lines, body fields, flow steps and the theme.'),
    }),
    annotations: READ,
    timeoutMs: SHORT_MS,
  },
  query_graph: {
    title: 'Query graph',
    description:
      'Answer a question about the connections of a diagram without reading all of it: the nodes that have an edge to a node (incomers), the nodes it has an edge to (outgoers), all its neighbours, or the shortest chain of edges from one node to another (path). Each result names the edge with its label and protocol.',
    input: z.object({
      diagramId,
      query: z.enum(['incomers', 'outgoers', 'neighbours', 'path']),
      node: z.string().describe('The node: its id, ref or unique label.'),
      to: z.string().optional().describe('With path: the node to reach, by id, ref or unique label.'),
    }),
    annotations: READ,
    timeoutMs: SHORT_MS,
  },
  lint_diagram: {
    title: 'Lint diagram',
    description:
      'Check a diagram for common problems before you show it: edges without a label, service and data cards without a technology line, overlapping nodes, nodes without edges, empty boundaries, cards with the same label, and flow steps whose node or edge is gone. For a C4 diagram it also checks that each element has a type badge and that the diagram has a key. Each issue names its nodes and edges, so you can fix them with update_elements.',
    input: z.object({ diagramId }),
    annotations: READ,
    timeoutMs: SHORT_MS,
  },
  search_icons: {
    title: 'Search icons',
    description:
      'Search icons for cards: AWS, Azure, Google Cloud and Kubernetes product icons, software logos and Lucide icons. Returns icon names and the card form that suits each product.',
    input: z.object({
      query: z.string().describe('Words to search for, for example "postgres", "lambda" or "message queue".'),
      provider: z.enum(PROVIDERS).optional().describe('Only search one icon set.'),
      limit: z.number().int().min(1).max(50).optional().describe('The largest number of results. The default is 12.'),
    }),
    annotations: READ,
    timeoutMs: SHORT_MS,
  },
  list_boundary_kinds: {
    title: 'List boundary kinds',
    description:
      'List the boundary kinds for groups: cloud accounts, regions, VPCs, subnets, Kubernetes clusters and namespaces, and general kinds. Each kind has a tier that sets how it nests.',
    input: z.object({
      provider: z.enum(BOUNDARY_PROVIDER_IDS).optional().describe('Only list one provider.'),
      query: z.string().optional().describe('Only list kinds whose name or keywords contain this text.'),
    }),
    annotations: READ,
    timeoutMs: SHORT_MS,
  },
  create_diagram: {
    title: 'Create diagram',
    description:
      'Create a diagram and open it in the editor. It is blank, or a copy of a template such as "order-system", "event-pipeline", "checkout-flow", "oidc-sign-in", "photo-upload", "webhook-delivery", "deploy-pipeline", "multi-cloud", "collaborative-editor", "rag-assistant", "mcp-agent", "c4-context" or "c4-containers". A copy of "c4-context" also copies the containers diagram that its system card opens.',
    input: z.object({
      name: z.string().describe('The diagram name, in sentence case.'),
      template: z.string().optional().describe('A template id to copy.'),
    }),
    annotations: ADD,
    timeoutMs: SHORT_MS,
  },
  open_diagram: {
    title: 'Open diagram',
    description: 'Open a diagram in the editor so that the user can watch the changes.',
    input: z.object({ diagramId: z.string().describe('The diagram id.') }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    timeoutMs: SHORT_MS,
  },
  update_diagram: {
    title: 'Update diagram',
    description:
      'Rename a diagram or change its theme: colour mode, fonts, background grid, protocol and boundary colours.',
    input: z.object({
      diagramId,
      name: z.string().optional(),
      theme: z
        .object({
          mode: z
            .enum(['auto', 'dark', 'light'])
            .optional()
            .describe('The canvas colour mode. auto (the default) follows the app theme.'),
          fonts: z.enum(FONT_PAIRS).optional(),
          background: z
            .enum(['dots', 'grid', 'none'])
            .optional()
            .describe('The canvas background: dots (the default), grid lines, or none.'),
          snap: z.boolean().optional().describe('If true, nodes snap to the 16 pixel grid.'),
          boundaryColors: z.boolean().optional(),
          protocolColors: z.boolean().optional(),
          routeAround: z
            .boolean()
            .optional()
            .describe('If true, round and step connections go around the other nodes. Off by default.'),
        })
        .optional(),
    }),
    annotations: CHANGE,
    timeoutMs: SHORT_MS,
  },
  delete_diagram: {
    title: 'Delete diagram',
    description: 'Delete a diagram. On the desktop the file goes to the trash.',
    input: z.object({ diagramId: z.string().describe('The diagram id.') }),
    annotations: CHANGE,
    timeoutMs: SHORT_MS,
  },
  import_mermaid: {
    title: 'Import Mermaid',
    description:
      'Make a new diagram from a Mermaid flowchart. Subgraphs become boundaries, known product names get icons, and the result is laid out.',
    input: z.object({
      source: z.string().describe('The Mermaid flowchart text, starting with "flowchart" or "graph".'),
      name: z.string().optional().describe('The diagram name.'),
    }),
    annotations: ADD,
    timeoutMs: LONG_MS,
  },
  import_trace: {
    title: 'Import trace',
    description:
      'Play a recorded request as a flow, from a distributed trace in OpenTelemetry (OTLP JSON), Jaeger or Zipkin format. Each call between services, databases, topics and outside hosts becomes a request step and a response step with the operation, latency and status. Cards with the same name stand for the services; missing cards and edges are added. Without diagramId, the tool makes a new diagram.',
    input: z.object({
      trace: z.string().describe('The text of the trace file, as JSON.'),
      diagramId: z
        .string()
        .optional()
        .describe('The diagram that gets the flow. Leave it out to make a new diagram from the trace.'),
      name: z.string().optional().describe('The name of a new diagram. The default is the operation of the root span.'),
    }),
    annotations: ADD,
    timeoutMs: LONG_MS,
  },
  add_elements: {
    title: 'Add nodes and edges',
    description:
      'Add nodes (cards, shapes, text, groups) and edges to a diagram in one undo step. Give nodes refs so that edges and parents in the same call can use them. Nodes without x and y are placed automatically. Returns the new ids.',
    input: z.object({
      diagramId,
      nodes: z.array(nodeInput).optional(),
      edges: z.array(edgeInput).optional(),
      direction: z
        .enum(LAYOUT_DIRECTIONS)
        .optional()
        .describe('The direction of automatic placement for new connected nodes. The default is RIGHT.'),
    }),
    annotations: ADD,
    timeoutMs: LONG_MS,
  },
  update_elements: {
    title: 'Update nodes and edges',
    description:
      'Change nodes and edges in one undo step: labels, icons, forms, lines, positions, sizes, parents, edge labels, protocols, styles, ends, and request and response bodies.',
    input: z.object({ diagramId, nodes: z.array(nodePatch).optional(), edges: z.array(edgePatch).optional() }),
    annotations: CHANGE,
    timeoutMs: SHORT_MS,
  },
  delete_elements: {
    title: 'Delete nodes and edges',
    description:
      'Delete nodes and edges in one undo step. Deleting a node also deletes its edges, and deleting a group also deletes the nodes in it unless keepChildren is true.',
    input: z.object({
      diagramId,
      nodes: z.array(nodeRef('A node to delete')).optional(),
      edges: z.array(edgeRef).optional(),
      keepChildren: z.boolean().optional().describe('If true, the nodes in deleted groups stay where they are.'),
    }),
    annotations: CHANGE,
    timeoutMs: SHORT_MS,
  },
  layout_diagram: {
    title: 'Lay out diagram',
    description:
      'Arrange all nodes automatically with a layered layout that keeps groups around their nodes. Use it after you add many nodes.',
    input: z.object({
      diagramId,
      direction: z
        .enum(LAYOUT_DIRECTIONS)
        .optional()
        .describe('The main direction of the edges. The default is RIGHT.'),
    }),
    annotations: CHANGE,
    timeoutMs: LONG_MS,
  },
  add_flow: {
    title: 'Add flow',
    description:
      'Add an animated flow: a token walks through nodes and edges step by step while a log line and a caption show for each step.',
    input: z.object({
      diagramId,
      name: z.string().describe('The flow name, for example "Checkout".'),
      steps: z.array(stepInput),
      paths: flowPaths,
      ...flowOptions,
    }),
    annotations: ADD,
    timeoutMs: SHORT_MS,
  },
  update_flow: {
    title: 'Update flow',
    description:
      'Change a flow: its name, token and options, and its steps (replace all, append, change by index or remove by index).',
    input: z.object({
      diagramId,
      flow: flowRef,
      name: z.string().optional(),
      steps: z
        .object({
          replace: z.array(stepInput).optional().describe('New steps for the whole flow.'),
          append: z.array(stepInput).optional().describe('Steps to add at the end.'),
          update: z
            .array(stepInput.partial().extend({ index: z.number().int().min(0).describe('The step index from 0.') }))
            .optional(),
          remove: z.array(z.number().int().min(0)).optional().describe('Indexes of steps to remove, from 0.'),
        })
        .optional(),
      paths: flowPaths,
      ...flowOptions,
    }),
    annotations: CHANGE,
    timeoutMs: SHORT_MS,
  },
  delete_flow: {
    title: 'Delete flow',
    description: 'Delete a flow from a diagram.',
    input: z.object({ diagramId, flow: flowRef }),
    annotations: CHANGE,
    timeoutMs: SHORT_MS,
  },
  render_image: {
    title: 'Render image',
    description:
      'Render a diagram as a PNG image to check your work: layout, overlaps, labels and icons. Can show only some nodes, a step of a flow, and the dark or light theme.',
    input: z.object({
      diagramId,
      focus: z
        .array(z.string())
        .optional()
        .describe('Show only the area around these nodes: ids, refs or unique labels.'),
      flow: flowRef.optional(),
      path: z.string().optional().describe('With flow: the path to show, by name or id. Without it, the main steps.'),
      step: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('With flow: the step index from 0 to show, among the steps that the path plays.'),
      theme: z
        .enum(['dark', 'light'])
        .optional()
        .describe('The canvas theme. The default is the theme of the diagram.'),
      maxSizePx: z
        .number()
        .int()
        .min(256)
        .max(4096)
        .optional()
        .describe('The longest side of the image. The default is 1568.'),
    }),
    annotations: READ,
    timeoutMs: LONG_MS,
  },
} satisfies Record<string, ToolDefinition>

export type ToolName = keyof typeof TOOL_DEFINITIONS
export type ToolInput<N extends ToolName> = z.infer<(typeof TOOL_DEFINITIONS)[N]['input']>
export type NodeInput = z.infer<typeof nodeInput>
export type NodePatch = z.infer<typeof nodePatch>
export type EdgeInput = z.infer<typeof edgeInput>
export type StepInput = z.infer<typeof stepInput>
export type PathInput = z.infer<typeof pathInput>

export const TOOL_NAMES = Object.keys(TOOL_DEFINITIONS) as ToolName[]

export function isToolName(name: string): name is ToolName {
  return Object.hasOwn(TOOL_DEFINITIONS, name)
}
