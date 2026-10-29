import { searchIcons } from '@/canvas/icons/library'
import { BOUNDARY_KINDS, boundaryKindLabel, type BoundaryTier } from '@/model/boundaries'
import { nodeLabel } from '@/model/labels'
import { repository } from '@/persistence/active-repository'
import { useDoc } from '@/store/doc-store'
import { useUi } from '@/store/ui-store'
import { compactDiagram } from '@/agent/compact'
import { ToolError } from '@/agent/errors'
import { lintDiagram, queryGraph } from '@/agent/graph-checks'
import { createResolver } from '@/agent/resolve'
import type { HandlerContext } from '@/agent/context'
import type { ToolInput } from '@/agent/tool-definitions'
import { diagramContent, editorShows, json, targetDiagramId, type ToolHandler } from './common'

const DEFAULT_ICON_LIMIT = 12

/** The order in which boundary tiers nest, from the outside in. */
const TIER_ORDER: readonly Exclude<BoundaryTier, 'custom'>[] = [
  'scope',
  'logical',
  'location',
  'network',
  'zone',
  'subnet',
  'security',
  'runtime',
]

export const listDiagrams: ToolHandler<'list_diagrams'> = async ({ query }, ctx) => {
  const open = ctx.openDiagramId()
  const wanted = query?.trim().toLowerCase()
  const diagrams = repository()
    .list()
    .filter((meta) => !wanted || meta.name.toLowerCase().includes(wanted))
    .map((meta) => ({
      id: meta.id,
      name: meta.name,
      updated: new Date(meta.updatedAt).toISOString(),
      nodes: meta.nodeCount,
      flows: meta.flowCount,
      ...(meta.id === open ? { open: true } : {}),
    }))
  return json({ diagrams })
}

export const getEditorState: ToolHandler<'get_editor_state'> = async (_input, ctx) => {
  const doc = useDoc.getState()
  if (!doc.id || !editorShows(ctx, doc.id)) {
    return json({ open: null, hint: 'The editor shows no diagram. Call list_diagrams.' })
  }
  const activeFlowId = useUi.getState().activeFlowId
  const activeFlow = doc.flows.find((flow) => flow.id === activeFlowId)
  return json({
    open: { id: doc.id, name: doc.name },
    selection: {
      nodes: doc.nodes.filter((node) => node.selected).map((node) => ({ id: node.id, label: nodeLabel(node) })),
      edges: doc.edges.filter((edge) => edge.selected).map((edge) => ({ id: edge.id, label: edge.data?.label ?? '' })),
    },
    ...(activeFlow ? { activeFlow: { id: activeFlow.id, name: activeFlow.name } } : {}),
  })
}

export const getDiagram: ToolHandler<'get_diagram'> = async ({ diagramId, detail }, ctx) => {
  const id = targetDiagramId(ctx, diagramId)
  return json(compactDiagram(diagramContent(ctx, id), detail))
}

type IconProvider = NonNullable<ToolInput<'search_icons'>['provider']>

const PROVIDER_WORDS: Record<string, IconProvider> = {
  aws: 'aws',
  amazon: 'aws',
  azure: 'azure',
  microsoft: 'azure',
  gcp: 'gcp',
  google: 'gcp',
  kubernetes: 'k8s',
  k8s: 'k8s',
}

function words(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** Takes a provider name out of the search words, for example "kubernetes pod" becomes "pod" in the k8s set. */
function splitProvider(query: string): { query: string; provider: IconProvider | undefined } {
  const all = words(query)
  const provider = all.map((word) => PROVIDER_WORDS[word]).find((found) => found !== undefined)
  const rest = all.filter((word) => !PROVIDER_WORDS[word])
  return provider && rest.length > 0 ? { query: rest.join(' '), provider } : { query, provider: undefined }
}

async function findIcons(ctx: HandlerContext, query: string, provider: IconProvider | undefined, max: number) {
  const products =
    provider === 'lucide'
      ? []
      : searchIcons(
          (await ctx.iconSets()).filter((set) => !provider || set.source === provider),
          query,
          max,
        ).map((entry) => ({ icon: entry.id, title: entry.title, category: entry.category, form: entry.form }))
  const searched = words(query)
  const lucide =
    provider && provider !== 'lucide'
      ? []
      : (await ctx.lucideNames())
          .filter((name) => searched.length > 0 && searched.every((word) => name.includes(word)))
          .slice(0, max)
          .map((name) => ({ icon: name, title: name, category: 'Lucide' }))
  return [...products, ...lucide].slice(0, max)
}

export const searchIconsHandler: ToolHandler<'search_icons'> = async ({ query, provider, limit }, ctx) => {
  const max = limit ?? DEFAULT_ICON_LIMIT
  const split = provider ? { query, provider } : splitProvider(query)
  let icons = await findIcons(ctx, split.query, split.provider, max)
  if (icons.length === 0 && split.query !== query) icons = await findIcons(ctx, query, provider, max)
  return json({
    icons,
    ...(icons.length === 0
      ? { hint: 'No icon matched. Try a shorter or more general word, or use a Lucide icon such as "server".' }
      : {}),
  })
}

export const listBoundaryKinds: ToolHandler<'list_boundary_kinds'> = async ({ provider, query }) => {
  const wanted = query?.trim().toLowerCase()
  const kinds = BOUNDARY_KINDS.filter((kind) => !provider || kind.provider === provider)
    .filter(
      (kind) =>
        !wanted ||
        kind.name.toLowerCase().includes(wanted) ||
        kind.keywords.some((keyword) => keyword.includes(wanted)) ||
        kind.id.includes(wanted),
    )
    .map((kind) => ({
      kind: kind.id,
      name: boundaryKindLabel(kind) || kind.name,
      provider: kind.provider,
      tier: kind.tier,
      ...(kind.detailHint ? { detailExample: kind.detailHint } : {}),
    }))
  return json({
    kinds,
    nesting: `Tiers nest from the outside in: ${TIER_ORDER.join(' > ')}. A custom group can go at any level. A runtime boundary, such as a cluster, draws solid.`,
  })
}

export const queryGraphHandler: ToolHandler<'query_graph'> = async ({ diagramId, query, node, to }, ctx) => {
  const content = diagramContent(ctx, targetDiagramId(ctx, diagramId))
  const resolver = createResolver(content.nodes, content.edges)
  const from = resolver.node(node)
  if (query === 'path' && !to) throw new ToolError('A path query needs "to": the node to reach.')
  return json(queryGraph(content, query, from.id, to ? resolver.node(to).id : undefined))
}

export const lintDiagramHandler: ToolHandler<'lint_diagram'> = async ({ diagramId }, ctx) => {
  const content = diagramContent(ctx, targetDiagramId(ctx, diagramId))
  const issues = lintDiagram(content)
  return json(issues.length === 0 ? { issues, message: 'No problems found.' } : { issues })
}
