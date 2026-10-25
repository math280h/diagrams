import { absolutePosition, descendantIds } from '@/model/graph'
import { nodeLabel } from '@/model/labels'
import type { DiagramEdge, DiagramNode } from '@/model/types'
import {
  addNodes,
  applyLayoutResult,
  deleteElements,
  fitGroupsToChildren,
  patchNodesData,
  setNodeFrames,
  ungroupNodes,
  updateEdges,
  type EdgeUpdate,
  type NodeDataPatch,
  type NodeFrame,
} from '@/store/actions'
import { useDoc } from '@/store/doc-store'
import { ToolError } from '@/agent/errors'
import { placeNodes, type LayoutFunction } from '@/agent/placement'
import { createResolver, type Resolver } from '@/agent/resolve'
import { buildEdge, buildNode, createIconChecker, edgeDataPatch, edgeSides, nodeDataPatch } from './build'
import { commitEdit, json, openForEdit, type ToolHandler } from './common'
import { withWarnings } from '@/agent/warnings'

const CHECK_HINT = 'Call render_image to check the result.'

function requireGroup(resolver: Resolver, reference: string, child: string): DiagramNode {
  const parent = resolver.node(reference)
  if (parent.type !== 'group') {
    throw new ToolError(`"${nodeLabel(parent)}" is a ${parent.type}, not a group, so it cannot hold "${child}".`)
  }
  return parent
}

export const addElements: ToolHandler<'add_elements'> = async (input, ctx) => {
  const nodeInputs = input.nodes ?? []
  const edgeInputs = input.edges ?? []
  if (nodeInputs.length === 0 && edgeInputs.length === 0) throw new ToolError('Give at least one node or edge to add.')
  const diagramId = await openForEdit(ctx, input.diagramId)
  const warnings: string[] = []
  const icons = createIconChecker(ctx)

  const refs = new Map<string, string>()
  const fixed = new Set<string>()
  const built: DiagramNode[] = []
  for (const nodeInput of nodeInputs) {
    if (nodeInput.ref !== undefined && refs.has(nodeInput.ref)) {
      throw new ToolError(`The ref "${nodeInput.ref}" is used for more than one node.`)
    }
    const icon = await icons.check(nodeInput.icon, warnings)
    const node = buildNode(nodeInput, icon, await icons.formOf(icon), warnings)
    if (nodeInput.ref !== undefined) refs.set(nodeInput.ref, node.id)
    const hasX = nodeInput.x !== undefined
    if (hasX && nodeInput.y !== undefined) fixed.add(node.id)
    else if (hasX || nodeInput.y !== undefined) {
      warnings.push(`"${nodeInput.label}" has only one of x and y, so it was placed automatically.`)
    }
    built.push(node)
  }

  const doc = useDoc.getState()
  const resolver = createResolver([...doc.nodes, ...built], doc.edges, refs)
  nodeInputs.forEach((nodeInput, index) => {
    if (nodeInput.parent === undefined) return
    const node = built[index]!
    const parent = requireGroup(resolver, nodeInput.parent, nodeInput.label)
    if (parent.id === node.id) throw new ToolError(`"${nodeInput.label}" cannot be its own parent.`)
    node.parentId = parent.id
  })
  const byId = new Map(built.map((node) => [node.id, node]))
  for (const node of built) {
    const seen = new Set<string>()
    for (let parentId = node.parentId; parentId && byId.has(parentId); parentId = byId.get(parentId)!.parentId) {
      if (seen.has(parentId)) throw new ToolError(`The parents of "${nodeLabel(node)}" form a loop.`)
      seen.add(parentId)
    }
  }

  const edges = edgeInputs.map((edgeInput) => buildEdge(edgeInput, resolver, warnings))
  const placed = await placeNodes({
    existing: doc.nodes,
    added: built,
    fixed,
    edges: [...doc.edges, ...edges],
    direction: input.direction ?? 'RIGHT',
    layout: ctx.layout,
  })
  const routed = edges.map((edge): DiagramEdge => {
    const route = placed.routes.get(edge.id)
    return route && edge.data ? { ...edge, data: { ...edge.data, route } } : edge
  })
  await commitEdit(ctx, diagramId, () => {
    addNodes(placed.added, routed, false)
    fitGroupsToChildren(placed.containers)
  })

  return json(
    withWarnings(
      {
        diagramId,
        nodes: built.map((node, index) => ({
          ...(nodeInputs[index]!.ref !== undefined ? { ref: nodeInputs[index]!.ref } : {}),
          label: nodeLabel(node),
          id: node.id,
        })),
        edges: edges.map((edge) => ({ id: edge.id, from: edge.source, to: edge.target })),
        hint: CHECK_HINT,
      },
      warnings,
    ),
  )
}

export const updateElements: ToolHandler<'update_elements'> = async (input, ctx) => {
  const nodePatches = input.nodes ?? []
  const edgePatches = input.edges ?? []
  if (nodePatches.length === 0 && edgePatches.length === 0)
    throw new ToolError('Give at least one node or edge to change.')
  const diagramId = await openForEdit(ctx, input.diagramId)
  const warnings: string[] = []
  const icons = createIconChecker(ctx)
  const doc = useDoc.getState()
  const resolver = createResolver(doc.nodes, doc.edges)

  const dataPatches = new Map<string, NodeDataPatch>()
  const frames: NodeFrame[] = []
  for (const patch of nodePatches) {
    const node = resolver.node(patch.node)
    const icon = await icons.check(patch.icon, warnings)
    const data = nodeDataPatch(node, patch, icon, warnings)
    if (Object.keys(data).length > 0) dataPatches.set(node.id, data)
    const frame: NodeFrame = { id: node.id }
    if (patch.x !== undefined) frame.x = patch.x
    if (patch.y !== undefined) frame.y = patch.y
    if (patch.width !== undefined) frame.width = patch.width
    if (patch.height !== undefined) frame.height = patch.height
    if (patch.parent === null) frame.parentId = null
    else if (patch.parent !== undefined) {
      const parent = requireGroup(resolver, patch.parent, nodeLabel(node))
      if (parent.id === node.id || descendantIds([node.id], doc.nodes).has(parent.id)) {
        throw new ToolError(`"${nodeLabel(node)}" cannot go inside "${nodeLabel(parent)}", which is inside it.`)
      }
      frame.parentId = parent.id
    }
    if (Object.keys(frame).length > 1) frames.push(frame)
  }
  const moved = await placeMovedNodes(
    doc.nodes,
    doc.edges,
    frames.filter(
      (frame) =>
        frame.parentId &&
        frame.x === undefined &&
        frame.y === undefined &&
        frame.parentId !== doc.nodes.find((node) => node.id === frame.id)?.parentId,
    ),
    ctx.layout,
  )

  const edgeUpdates = edgePatches.map((patch): EdgeUpdate => {
    const edge = resolver.edge(patch.edge)
    const source = patch.from !== undefined ? resolver.node(patch.from).id : edge.source
    const target = patch.to !== undefined ? resolver.node(patch.to).id : edge.target
    if (source === target) throw new ToolError(`The edge "${patch.edge}" cannot go from a node to itself.`)
    return { id: edge.id, source, target, data: edgeDataPatch(patch, edge.data), sides: edgeSides(patch) }
  })

  await commitEdit(ctx, diagramId, () => {
    patchNodesData(dataPatches)
    setNodeFrames(frames.map((frame) => moved.placed.get(frame.id) ?? frame))
    fitGroupsToChildren(moved.containers)
    updateEdges(edgeUpdates)
  })

  return json(withWarnings({ diagramId, nodes: nodePatches.length, edges: edgePatches.length }, warnings))
}

/**
 * Places nodes that move into another group inside that group, below its content, and grows the group around them.
 *
 * @returns Frames with canvas positions for the moved nodes, and the groups that must grow around them.
 */
async function placeMovedNodes(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  frames: NodeFrame[],
  layout: LayoutFunction,
): Promise<{ placed: Map<string, NodeFrame>; containers: string[] }> {
  if (frames.length === 0) return { placed: new Map(), containers: [] }
  const targets = new Map(frames.map((frame) => [frame.id, frame.parentId ?? undefined]))
  const existing = nodes.filter((node) => !targets.has(node.id))
  const added = nodes
    .filter((node) => targets.has(node.id))
    .map((node) => ({ ...node, parentId: targets.get(node.id) }))
  const result = await placeNodes({ existing, added, fixed: new Set(), edges, direction: 'RIGHT', layout })
  const byId = new Map([...existing, ...result.added].map((node) => [node.id, node]))
  const placed = new Map(
    result.added.map((node) => {
      const frame = frames.find((candidate) => candidate.id === node.id)!
      return [node.id, { ...frame, ...absolutePosition(node, byId) }]
    }),
  )
  return { placed, containers: result.containers }
}

export const deleteElementsHandler: ToolHandler<'delete_elements'> = async (input, ctx) => {
  const diagramId = await openForEdit(ctx, input.diagramId)
  const doc = useDoc.getState()
  const resolver = createResolver(doc.nodes, doc.edges)
  const nodes = (input.nodes ?? []).map((reference) => resolver.node(reference))
  const edgeIds = (input.edges ?? []).map((reference) => resolver.edge(reference).id)
  if (nodes.length === 0 && edgeIds.length === 0) throw new ToolError('Give at least one node or edge to delete.')

  await commitEdit(ctx, diagramId, () => {
    if (input.keepChildren) {
      ungroupNodes(nodes.filter((node) => node.type === 'group').map((node) => node.id))
      deleteElements(
        nodes.filter((node) => node.type !== 'group').map((node) => node.id),
        edgeIds,
      )
    } else {
      deleteElements(
        nodes.map((node) => node.id),
        edgeIds,
      )
    }
  })

  const after = useDoc.getState()
  const alive = new Set([...after.nodes.map((node) => node.id), ...after.edges.map((edge) => edge.id)])
  const warnings = after.flows.flatMap((flow) => {
    const lost = flow.steps.filter((step) => !alive.has(step.target.id)).length
    return lost > 0
      ? [`The flow "${flow.name}" has ${lost} steps whose node or edge is gone. Fix it with update_flow.`]
      : []
  })
  return json(
    withWarnings(
      {
        diagramId,
        deleted: { nodes: doc.nodes.length - after.nodes.length, edges: doc.edges.length - after.edges.length },
      },
      warnings,
    ),
  )
}

export const layoutDiagramHandler: ToolHandler<'layout_diagram'> = async ({ diagramId, direction }, ctx) => {
  const id = await openForEdit(ctx, diagramId)
  const { nodes, edges } = useDoc.getState()
  if (nodes.length === 0) return json({ diagramId: id, nodes: 0 })
  const result = await ctx.layout(nodes, edges, direction ?? 'RIGHT')
  await commitEdit(ctx, id, () => applyLayoutResult(result))
  return json({ diagramId: id, nodes: nodes.length, hint: CHECK_HINT })
}
