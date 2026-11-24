import { describe, expect, it } from 'vitest'
import { compileFlow } from '@/engine/flow/compile'
import { createFlow } from '@/model/defaults'
import { stepCaptionStyle } from '@/model/flow'
import type { CaptionStyle, Flow, FlowPath, Step, StepTarget } from '@/model/schema'
import { CAPTION_HEIGHT_PX, captionSpace, SUBTITLE_SPACE_PX } from './caption-space'

const NODES = new Set(['a', 'b', 'c'])
const EDGES = [
  { id: 'ab', source: 'a', target: 'b' },
  { id: 'bc', source: 'b', target: 'c' },
]

function step(id: string, target: StepTarget, captionStyle?: CaptionStyle): Step {
  return {
    id,
    target,
    caption: '',
    event: '',
    latencyMs: null,
    level: 'info',
    durationMs: 1000,
    camera: 'follow',
    zoom: 1,
    ...(captionStyle ? { captionStyle } : {}),
  }
}

const overview = (id: string, captionStyle?: CaptionStyle) => step(id, { kind: 'flow', id: '' }, captionStyle)
const node = (id: string, captionStyle?: CaptionStyle) => step(`s-${id}`, { kind: 'node', id }, captionStyle)

function flowOf(captionStyle: CaptionStyle, steps: Step[], paths?: FlowPath[]): Flow {
  return { ...createFlow('Checkout'), captionStyle, steps, ...(paths ? { paths } : {}) }
}

const space = (flow: Flow, pathId: string | null = null) => captionSpace(compileFlow(flow, NODES, EDGES, pathId))

describe('stepCaptionStyle', () => {
  it('uses the style of the step, else the style of the flow', () => {
    const flow = flowOf('callout', [])
    expect(stepCaptionStyle(flow, node('a'))).toBe('callout')
    expect(stepCaptionStyle(flow, node('a', 'top'))).toBe('top')
    expect(stepCaptionStyle(flowOf('none', []), node('a', 'subtitle'))).toBe('subtitle')
  })

  it('shows the callout of an overview step as a subtitle, and keeps its other styles', () => {
    expect(stepCaptionStyle(flowOf('callout', []), overview('intro'))).toBe('subtitle')
    expect(stepCaptionStyle(flowOf('bottom', []), overview('intro', 'callout'))).toBe('subtitle')
    expect(stepCaptionStyle(flowOf('callout', []), overview('intro', 'top'))).toBe('top')
    expect(stepCaptionStyle(flowOf('bottom', []), overview('intro'))).toBe('bottom')
  })
})

describe('captionSpace', () => {
  it('keeps no space for callouts and hidden captions', () => {
    expect(space(flowOf('callout', [node('a'), node('b')]))).toEqual({ top: 0, bottom: 0 })
    expect(space(flowOf('none', [node('a'), node('b', 'callout')]))).toEqual({ top: 0, bottom: 0 })
    expect(captionSpace(null)).toEqual({ top: 0, bottom: 0 })
  })

  it('keeps space for the bars and the subtitle that the steps use', () => {
    expect(space(flowOf('bottom', [node('a')]))).toEqual({ top: 0, bottom: CAPTION_HEIGHT_PX })
    expect(space(flowOf('callout', [node('a'), node('b', 'top')]))).toEqual({ top: CAPTION_HEIGHT_PX, bottom: 0 })
    expect(space(flowOf('subtitle', [node('a'), node('b', 'bottom')]))).toEqual({
      top: 0,
      bottom: Math.max(SUBTITLE_SPACE_PX, CAPTION_HEIGHT_PX),
    })
  })

  it('keeps subtitle space for an overview step of a callout flow', () => {
    expect(space(flowOf('callout', [overview('intro'), node('a')]))).toEqual({ top: 0, bottom: SUBTITLE_SPACE_PX })
  })

  it('counts the steps of side paths, and of the alternate path only when it plays', () => {
    const side: FlowPath = {
      id: 'side',
      name: 'Worker',
      fromStep: 's-a',
      steps: [node('c', 'top')],
      rejoinStep: null,
      concurrent: true,
    }
    expect(space(flowOf('callout', [node('a'), node('b')], [side]))).toEqual({ top: CAPTION_HEIGHT_PX, bottom: 0 })

    const { concurrent: _concurrent, ...alternate } = side
    const declined: FlowPath = { ...alternate, id: 'declined', name: 'Declined', steps: [node('c', 'bottom')] }
    const flow = flowOf('callout', [node('a'), node('b')], [declined])
    expect(space(flow)).toEqual({ top: 0, bottom: 0 })
    expect(space(flow, 'declined')).toEqual({ top: 0, bottom: CAPTION_HEIGHT_PX })
  })
})
