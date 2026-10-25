import { layoutWarnings } from '@/agent/compact'
import { ToolError } from '@/agent/errors'
import { createResolver, resolveFlow } from '@/agent/resolve'
import { diagramContent, stepRangeHint, targetDiagramId, type ToolHandler } from './common'
import { withWarnings } from '@/agent/warnings'

const DEFAULT_MAX_SIZE_PX = 1568
/** The smallest scale at which an image keeps small canvas text readable. */
const READABLE_SCALE = 0.5

export const renderImage: ToolHandler<'render_image'> = async (input, ctx) => {
  const id = targetDiagramId(ctx, input.diagramId)
  const content = diagramContent(ctx, id)
  if (content.nodes.length === 0) throw new ToolError('The diagram is empty, so there is nothing to render.')
  const resolver = createResolver(content.nodes, content.edges)
  const focusIds = input.focus?.map((reference) => resolver.node(reference).id)
  const flow = input.flow !== undefined ? resolveFlow(content.flows, input.flow) : undefined
  if (input.step !== undefined && !flow) throw new ToolError('Give a flow together with step.')
  if (flow && input.step !== undefined && input.step >= flow.steps.length) {
    throw new ToolError(`The flow "${flow.name}" has no step ${input.step}. ${stepRangeHint(flow.steps.length)}`)
  }

  const image = await ctx.renderPng(content, {
    focusIds,
    flowId: flow?.id,
    step: input.step,
    theme: input.theme,
    maxSizePx: input.maxSizePx ?? DEFAULT_MAX_SIZE_PX,
  })
  const warnings = layoutWarnings(content.nodes)
  if (image.scale < READABLE_SCALE) {
    warnings.push(
      `The image shows the diagram at ${Math.round(image.scale * 100)} percent, so small text is hard to read. Use focus to see one part.`,
    )
  }
  return [
    { type: 'image', mimeType: 'image/png', data: image.data },
    {
      type: 'text',
      text: JSON.stringify(
        withWarnings({ width: image.width, height: image.height, scale: Number(image.scale.toFixed(2)) }, warnings),
      ),
    },
  ]
}
