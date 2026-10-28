import type { DiagramContent } from '@/agent/compact'
import type { RenderRequest } from '@/desktop/contract'
import { migrate } from '@/persistence/migrations'
import { fromDiagram } from '@/persistence/serialize'
import { renderDiagramImage, renderDiagramVideo } from './render-image'

const IMAGE_MAX_SIZE_PX = 2048

export class RenderRequestError extends Error {}

/**
 * Renders a diagram file as an image, a video or a GIF.
 *
 * @throws RenderRequestError If the file is not a diagram, the diagram is empty, or it has no flow or no path with the
 *   name or the id.
 */
export async function renderDiagramFile(request: RenderRequest): Promise<Blob> {
  let content: DiagramContent
  try {
    const diagram = migrate(JSON.parse(request.text))
    content = {
      id: diagram.id,
      name: diagram.name,
      theme: diagram.theme,
      flows: diagram.flows,
      ...fromDiagram(diagram),
    }
  } catch (error) {
    throw new RenderRequestError(`The file is not a diagram: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (content.nodes.length === 0) throw new RenderRequestError('The diagram is empty, so there is nothing to render.')
  let flowId: string | undefined
  let pathId: string | undefined
  if (request.flow !== undefined) {
    const flow = content.flows.find((candidate) => candidate.id === request.flow || candidate.name === request.flow)
    if (!flow) {
      const names = content.flows.map((candidate) => `"${candidate.name}"`).join(', ') || 'none'
      throw new RenderRequestError(`The diagram has no flow "${request.flow}". Its flows: ${names}.`)
    }
    flowId = flow.id
    if (request.path !== undefined) {
      const path = flow.paths?.find((candidate) => candidate.id === request.path || candidate.name === request.path)
      if (!path) {
        const names = (flow.paths ?? []).map((candidate) => `"${candidate.name}"`).join(', ') || 'none'
        throw new RenderRequestError(`The flow "${flow.name}" has no path "${request.path}". Its paths: ${names}.`)
      }
      pathId = path.id
    }
  } else if (request.path !== undefined) {
    throw new RenderRequestError('Give --flow together with --path.')
  }
  if (request.format === 'png' || request.format === 'svg') {
    const { blob } = await renderDiagramImage(content, {
      format: request.format,
      theme: request.theme,
      flowId,
      pathId,
      step: request.step,
      maxSizePx: request.maxSizePx ?? IMAGE_MAX_SIZE_PX,
    })
    return blob
  }
  return renderDiagramVideo(content, {
    format: request.format,
    theme: request.theme,
    flowId,
    pathId,
    ...(request.maxSizePx !== undefined ? { maxSizePx: request.maxSizePx } : {}),
  })
}
