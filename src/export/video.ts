import { captureCanvas, canvasBackground, waitForCommit } from './capture'
import type { StageHandle } from './ExportStage'

export type VideoFormat = 'mp4' | 'webm' | 'gif'

export interface RecordOptions {
  format: VideoFormat
  fps: number
  durationMs: number
  /** The ambient clock time of the first frame. */
  ambientStartMs: number
  /** The capture scale. The output size is the stage size multiplied by this value. */
  scale: number
  signal: AbortSignal
  onProgress: (fraction: number) => void
}

export class ExportAbortedError extends Error {}

function even(value: number) {
  return Math.max(2, Math.floor(value / 2) * 2)
}

async function renderFrames(
  stage: StageHandle,
  options: RecordOptions,
  onFrame: (canvas: HTMLCanvasElement, index: number, total: number) => Promise<void>,
) {
  const total = Math.max(1, Math.round((options.durationMs / 1000) * options.fps))
  const background = canvasBackground(stage.root)
  for (let index = 0; index < total; index++) {
    if (options.signal.aborted) throw new ExportAbortedError('The export stopped.')
    const timeMs = (index / options.fps) * 1000
    stage.engine.render(options.ambientStartMs + timeMs, timeMs)
    await waitForCommit()
    const frame = await captureCanvas(stage.root, { scale: options.scale, backgroundColor: background, fast: true })
    await onFrame(frame, index, total)
    options.onProgress((index + 1) / total)
  }
}

/**
 * Records the stage frame by frame and encodes the frames.
 *
 * @throws ExportAbortedError If the signal aborts.
 * @throws Error If the browser has no encoder for the format.
 */
export async function recordStage(stage: StageHandle, options: RecordOptions): Promise<Blob> {
  const width = even(stage.root.clientWidth * options.scale)
  const height = even(stage.root.clientHeight * options.scale)
  const target = document.createElement('canvas')
  target.width = width
  target.height = height
  const context = target.getContext('2d')!

  if (options.format === 'gif') {
    const [{ Encoder }, { default: workerUrl }] = await Promise.all([
      import('modern-gif'),
      import('modern-gif/worker?url'),
    ])
    const encoder = new Encoder({ width, height, workerUrl, maxColors: 255 })
    await renderFrames(stage, options, async (frame) => {
      context.drawImage(frame, 0, 0, width, height)
      await encoder.encode({ data: context.getImageData(0, 0, width, height).data, delay: 1000 / options.fps })
    })
    return encoder.flush('blob')
  }

  const mediabunny = await import('mediabunny')
  const format = options.format === 'mp4' ? new mediabunny.Mp4OutputFormat() : new mediabunny.WebMOutputFormat()
  const codec = await mediabunny.getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), { width, height })
  if (!codec)
    throw new Error(
      `This browser cannot encode ${options.format.toUpperCase()} video. Try ${options.format === 'mp4' ? 'WebM' : 'MP4'} or GIF.`,
    )
  const output = new mediabunny.Output({ format, target: new mediabunny.BufferTarget() })
  const source = new mediabunny.CanvasSource(target, { codec, bitrate: mediabunny.QUALITY_HIGH })
  output.addVideoTrack(source, { frameRate: options.fps })
  await output.start()
  try {
    await renderFrames(stage, options, async (frame, index) => {
      context.drawImage(frame, 0, 0, width, height)
      await source.add(index / options.fps, 1 / options.fps)
    })
  } catch (error) {
    await output.cancel()
    throw error
  }
  await output.finalize()
  const buffer = output.target.buffer
  if (!buffer) throw new Error('The encoder returned no data.')
  return new Blob([buffer], { type: format.mimeType })
}
