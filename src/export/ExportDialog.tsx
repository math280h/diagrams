import { Download, Loader2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useCanvasTheme } from '@/canvas/canvas-theme'
import { useReducedMotion } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useEngine } from '@/engine/hooks'
import { compileFlow } from '@/engine/flow/compile'
import { downloadBlob } from '@/lib/download'
import { formatSeconds, safeFileName } from '@/lib/format'
import { useDoc } from '@/store/doc-store'
import { setUi, useUi, type ExportKind } from '@/store/ui-store'
import { Choice, Field, Segmented, SliderField, SwitchField } from '@/editor/inspector/controls'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { errorMessage } from '@/lib/error-message'
import { diagramBounds } from './bounds'
import { captureBlob, canvasBackground, prepareAssets, waitForPaint } from './capture'
import { ExportStage, type StageHandle } from './ExportStage'
import { HtmlExport } from './HtmlExport'
import { MermaidExport } from './MermaidExport'
import { usePainted } from './use-painted'
import { ExportAbortedError, recordStage, type VideoFormat } from './video'

type ThemeChoice = 'canvas' | 'dark' | 'light'
type Frame = '16:9' | '1:1' | '9:16'

const FRAME_SIZE: Record<Frame, { width: number; height: number }> = {
  '16:9': { width: 1280, height: 720 },
  '1:1': { width: 720, height: 720 },
  '9:16': { width: 720, height: 1280 },
}
const GIF_MAX_WIDTH = 960
const FLOW_END_HOLD_MS = 800
const PREVIEW_SHARES = [0.08, 0.3, 0.52, 0.74, 0.96]
const PREVIEW_SCALE = 0.3
const PREVIEW_CYCLE_MS = 1100
const STAGE_FIT_PADDING = 0.12
const FORMAT_NAMES: Record<'png' | 'svg' | VideoFormat, string> = {
  png: 'PNG',
  svg: 'SVG',
  mp4: 'MP4',
  webm: 'WebM',
  gif: 'GIF',
}

function useStageContent(themeChoice: ThemeChoice, grid: boolean) {
  const nodes = useDoc((state) => state.nodes)
  const edges = useDoc((state) => state.edges)
  const theme = useDoc((state) => state.theme)
  const canvasTheme = useCanvasTheme(theme.mode)
  return {
    nodes: useMemo(() => nodes.map((node) => ({ ...node, selected: false, dragging: false })), [nodes]),
    edges: useMemo(() => edges.map((edge) => ({ ...edge, selected: false })), [edges]),
    theme: useMemo(() => (grid ? theme : { ...theme, background: 'none' as const }), [theme, grid]),
    resolvedTheme: themeChoice === 'canvas' ? canvasTheme : themeChoice,
  }
}

function ImageExport({ onClose }: { onClose: () => void }) {
  const painted = usePainted()
  const engine = useEngine()
  const name = useDoc((state) => state.name)
  const [format, setFormat] = useState<'png' | 'svg'>('png')
  const [scale, setScale] = useState(2)
  const [background, setBackground] = useState<'theme' | 'transparent'>('theme')
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>('canvas')
  const [padding, setPadding] = useState(64)
  const [grid, setGrid] = useState(false)
  const [ready, setReady] = useState<{ key: string; stage: StageHandle } | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const content = useStageContent(themeChoice, grid)
  const bounds = useMemo(() => diagramBounds(content.nodes), [content.nodes])
  const transparent = background === 'transparent'
  const stageKey = `${themeChoice}|${padding}|${transparent}|${grid}`
  const stage = ready?.key === stageKey ? ready.stage : null

  useEffect(() => {
    if (!stage) return
    let cancelled = false
    let url: string | null = null
    void (async () => {
      stage.engine.render(engine.ambient.time.get(), 0)
      await waitForPaint()
      const blob = await captureBlob(stage.root, 'png', {
        scale: 0.6,
        backgroundColor: transparent ? null : canvasBackground(stage.root),
      })
      if (cancelled) return
      url = URL.createObjectURL(blob)
      setPreview(url)
    })()
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [stage, engine, transparent])

  const onReady = useCallback(
    async (handle: StageHandle) => {
      await prepareAssets(useDoc.getState().nodes, [])
      setReady({ key: stageKey, stage: handle })
    },
    [stageKey],
  )

  const save = async () => {
    if (!stage) return
    setBusy(true)
    try {
      stage.engine.render(engine.ambient.time.get(), 0)
      await waitForPaint()
      const blob = await captureBlob(stage.root, format, {
        scale: format === 'png' ? scale : 1,
        backgroundColor: transparent ? null : canvasBackground(stage.root),
      })
      downloadBlob(blob, `${safeFileName(name)}.${format}`)
      toast.success(`Exported ${FORMAT_NAMES[format]}`)
      onClose()
    } catch (error) {
      toast.error('The image export failed.', { description: errorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  const width = Math.ceil(bounds.width + padding * 2)
  const height = Math.ceil(bounds.height + padding * 2)

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-[1fr_240px]">
        <div className="dg-thumb-grid grid min-h-56 place-items-center overflow-hidden rounded-xl border p-3">
          {preview && stage ? (
            <img src={preview} alt="Export preview" className="max-h-72 w-auto max-w-full rounded-sm" />
          ) : (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          )}
        </div>
        <div className="space-y-3">
          <Field label="Format">
            <Segmented
              value={format}
              onChange={setFormat}
              options={[
                { value: 'png', label: 'PNG' },
                { value: 'svg', label: 'SVG' },
              ]}
            />
          </Field>
          {format === 'png' && (
            <Field label="Scale">
              <Segmented
                value={String(scale) as '1' | '2' | '3' | '4'}
                onChange={(value) => setScale(Number(value))}
                options={[1, 2, 3, 4].map((value) => ({
                  value: String(value) as '1' | '2' | '3' | '4',
                  label: `${value}×`,
                }))}
              />
            </Field>
          )}
          <Field label="Theme">
            <Segmented
              value={themeChoice}
              onChange={setThemeChoice}
              options={[
                { value: 'canvas', label: 'As shown' },
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
              ]}
            />
          </Field>
          <Field label="Background">
            <Segmented
              value={background}
              onChange={setBackground}
              options={[
                { value: 'theme', label: 'Filled' },
                { value: 'transparent', label: 'Transparent' },
              ]}
            />
          </Field>
          <SwitchField label="Show the grid" checked={grid && !transparent} onChange={setGrid} />
          <SliderField
            label="Padding"
            value={padding}
            min={0}
            max={200}
            step={8}
            format={(value) => `${value} px`}
            onChange={setPadding}
          />
          <p className="text-xs text-muted-foreground tabular-nums">
            {format === 'png' ? `${width * scale} × ${height * scale} px` : `${width} × ${height} vector frame`}
          </p>
          {format === 'svg' && (
            <p className="text-xs text-muted-foreground">
              The SVG keeps the text and the shapes sharp in browsers. Design tools can show it as one image.
            </p>
          )}
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!stage || busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Download />} Export {FORMAT_NAMES[format]}
        </Button>
      </DialogFooter>
      {painted && (
        <ExportStage
          key={stageKey}
          width={width}
          height={height}
          {...content}
          transparent={transparent}
          viewport={{ x: padding - bounds.x, y: padding - bounds.y, zoom: 1 }}
          onReady={onReady}
        />
      )}
    </>
  )
}

function VideoExport({ onClose }: { onClose: () => void }) {
  const painted = usePainted()
  const engine = useEngine()
  const flows = useDoc((state) => state.flows)
  const name = useDoc((state) => state.name)
  const activeFlowId = useUi((state) => state.activeFlowId)
  const [source, setSource] = useState<string>(activeFlowId ?? flows[0]?.id ?? 'ambient')
  const [format, setFormat] = useState<VideoFormat>('mp4')
  const [frame, setFrame] = useState<Frame>('16:9')
  const [quality, setQuality] = useState<'720' | '1080'>('1080')
  const [fps, setFps] = useState(30)
  const [ambientSeconds, setAmbientSeconds] = useState(6)
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>('canvas')
  const [grid, setGrid] = useState(false)
  const [ready, setReady] = useState<{ key: string; stage: StageHandle } | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [captured, setCaptured] = useState<{ key: string; frames: { timeMs: number; url: string }[] } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const content = useStageContent(themeChoice, grid)
  const flow = flows.find((candidate) => candidate.id === source)
  const size = FRAME_SIZE[frame]
  const gif = format === 'gif'
  const scale = gif ? Math.min(1, GIF_MAX_WIDTH / size.width) : quality === '1080' ? 1.5 : 1
  const frameRate = gif ? Math.min(fps, 20) : fps
  const timeline = useMemo(
    () => (flow ? compileFlow(flow, new Set(content.nodes.map((node) => node.id)), content.edges) : null),
    [flow, content.nodes, content.edges],
  )
  const durationMs = timeline ? timeline.durationMs + FLOW_END_HOLD_MS : ambientSeconds * 1000
  const stageKey = `${frame}|${themeChoice}|${grid}`
  const stage = ready?.key === stageKey ? ready.stage : null

  useEffect(() => () => abortRef.current?.abort(), [])

  const recording = progress !== null

  const previewKey = `${stageKey}|${source}|${durationMs}`
  const frames = captured?.key === previewKey ? captured.frames : null

  useEffect(() => {
    if (!stage || recording) return
    let cancelled = false
    const urls: string[] = []
    void (async () => {
      if (flow && timeline) {
        stage.engine.playback.load(flow.id, timeline)
        stage.engine.playback.setFollow(true)
      } else {
        stage.engine.playback.load(null, null)
        await stage.fitView(STAGE_FIT_PADDING)
      }
      const list: { timeMs: number; url: string }[] = []
      for (const share of PREVIEW_SHARES) {
        if (cancelled) return
        const timeMs = share * durationMs
        stage.engine.render(engine.ambient.time.get() + timeMs, timeMs)
        await waitForPaint()
        const blob = await captureBlob(stage.root, 'png', {
          scale: PREVIEW_SCALE,
          backgroundColor: canvasBackground(stage.root),
        })
        const url = URL.createObjectURL(blob)
        urls.push(url)
        list.push({ timeMs, url })
      }
      if (!cancelled) setCaptured({ key: previewKey, frames: list })
    })()
    return () => {
      cancelled = true
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [stage, recording, flow, timeline, durationMs, engine, previewKey])

  const onReady = useCallback(
    async (handle: StageHandle) => {
      await prepareAssets(useDoc.getState().nodes, useDoc.getState().flows)
      await handle.fitView(STAGE_FIT_PADDING)
      setReady({ key: stageKey, stage: handle })
    },
    [stageKey],
  )

  const start = async () => {
    if (!stage) return
    const controller = new AbortController()
    abortRef.current = controller
    setProgress(0)
    try {
      if (flow && timeline) {
        stage.engine.playback.load(flow.id, timeline)
        stage.engine.playback.setFollow(true)
      } else {
        stage.engine.playback.load(null, null)
        await stage.fitView(STAGE_FIT_PADDING)
      }
      if (document.hidden) toast.warning('Keep this tab visible. The browser pauses rendering in hidden tabs.')
      const blob = await recordStage(stage, {
        format,
        fps: frameRate,
        durationMs,
        ambientStartMs: engine.ambient.time.get(),
        scale,
        signal: controller.signal,
        onProgress: setProgress,
      })
      downloadBlob(blob, `${safeFileName(flow ? `${name} ${flow.name}` : name)}.${format}`)
      toast.success(`Exported ${FORMAT_NAMES[format]}`)
      onClose()
    } catch (error) {
      if (!(error instanceof ExportAbortedError)) {
        toast.error('The animation export failed.', {
          description: errorMessage(error),
        })
      }
    } finally {
      setProgress(null)
      abortRef.current = null
    }
  }

  const outputWidth = Math.floor((size.width * scale) / 2) * 2
  const outputHeight = Math.floor((size.height * scale) / 2) * 2

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-[1fr_256px]">
        <FrameStrip frames={frames} aspect={size.width / size.height} />
        <div className="space-y-3">
          <Field label="Content" wide>
            <Choice
              label="Content"
              value={source}
              onChange={setSource}
              options={[
                ...flows.map((candidate) => ({ value: candidate.id, label: `Flow: ${candidate.name}` })),
                { value: 'ambient', label: 'Traffic only, no flow' },
              ]}
            />
          </Field>
          <Field label="Format">
            <Segmented
              value={format}
              onChange={setFormat}
              options={[
                { value: 'mp4', label: 'MP4' },
                { value: 'webm', label: 'WebM' },
                { value: 'gif', label: 'GIF' },
              ]}
            />
          </Field>
          <Field label="Frame">
            <Segmented
              value={frame}
              onChange={setFrame}
              options={[
                { value: '16:9', label: '16:9' },
                { value: '1:1', label: '1:1' },
                { value: '9:16', label: '9:16' },
              ]}
            />
          </Field>
          {!gif && (
            <Field label="Quality">
              <Segmented
                value={quality}
                onChange={setQuality}
                options={[
                  { value: '720', label: '720p' },
                  { value: '1080', label: '1080p' },
                ]}
              />
            </Field>
          )}
          <Field label="Frame rate">
            <Segmented
              value={String(fps) as '15' | '30' | '60'}
              onChange={(value) => setFps(Number(value))}
              options={(gif ? ['15', '20'] : ['30', '60']).map((value) => ({
                value: value as '15' | '30' | '60',
                label: `${value} fps`,
              }))}
            />
          </Field>
          <Field label="Theme">
            <Segmented
              value={themeChoice}
              onChange={setThemeChoice}
              options={[
                { value: 'canvas', label: 'As shown' },
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
              ]}
            />
          </Field>
          <SwitchField label="Show the grid" checked={grid} onChange={setGrid} />
          {!flow && (
            <SliderField
              label="Length"
              value={ambientSeconds}
              min={2}
              max={20}
              step={1}
              format={(value) => `${value} s`}
              onChange={setAmbientSeconds}
            />
          )}
          <p className="text-xs leading-5 whitespace-nowrap text-muted-foreground tabular-nums">
            {outputWidth} × {outputHeight} px
            <br />
            {formatSeconds(durationMs)}, {Math.round((durationMs / 1000) * frameRate)} frames
          </p>
          {progress !== null && (
            <div className="space-y-1.5">
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-foreground transition-[width]"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">Rendering frame by frame. Keep this tab visible.</p>
            </div>
          )}
        </div>
      </div>
      <DialogFooter>
        {progress !== null ? (
          <Button variant="ghost" onClick={() => abortRef.current?.abort()}>
            <X /> Stop
          </Button>
        ) : (
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        )}
        <Button onClick={start} disabled={!stage || progress !== null}>
          {progress !== null ? <Loader2 className="animate-spin" /> : <Download />}
          {progress !== null ? `${Math.round(progress * 100)}%` : `Export ${FORMAT_NAMES[format]}`}
        </Button>
      </DialogFooter>
      {painted && (
        <ExportStage
          key={stageKey}
          width={size.width}
          height={size.height}
          {...content}
          transparent={false}
          viewport={{ x: 0, y: 0, zoom: 1 }}
          onReady={onReady}
        />
      )}
    </>
  )
}

function FrameStrip({ frames, aspect }: { frames: { timeMs: number; url: string }[] | null; aspect: number }) {
  const reducedMotion = useReducedMotion()
  const [selected, setSelected] = useState(0)
  const [cycling, setCycling] = useState(true)
  const count = frames?.length ?? 0

  useEffect(() => {
    if (!cycling || reducedMotion || count === 0) return
    const timer = window.setInterval(() => setSelected((index) => (index + 1) % count), PREVIEW_CYCLE_MS)
    return () => window.clearInterval(timer)
  }, [cycling, reducedMotion, count])

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div
        className="dg-thumb-grid relative grid max-h-64 w-full place-items-center overflow-hidden rounded-xl border"
        style={{ aspectRatio: String(Math.max(aspect, 16 / 10)) }}
      >
        {frames ? (
          frames.map((frame, index) => (
            <img
              key={frame.url}
              src={frame.url}
              alt={index === selected ? `Frame at ${formatSeconds(frame.timeMs)}` : ''}
              className={cn(
                'absolute inset-0 m-auto max-h-full max-w-full object-contain transition-opacity duration-300',
                index === selected ? 'opacity-100' : 'opacity-0',
              )}
            />
          ))
        ) : (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        )}
      </div>
      <ToggleGroup
        aria-label="Preview frames"
        value={[String(selected)]}
        onValueChange={(next) => {
          const index = Number(next[0])
          if (!Number.isInteger(index)) return
          setSelected(index)
          setCycling(false)
        }}
        className="grid w-full grid-cols-5 gap-1.5"
      >
        {(frames ?? PREVIEW_SHARES.map(() => null)).map((frame, index) => (
          <ToggleGroupItem
            key={index}
            value={String(index)}
            aria-label={frame ? `Show the frame at ${formatSeconds(frame.timeMs)}` : 'Frame not ready'}
            disabled={!frame}
            className="flex h-8 w-full min-w-0 flex-col items-stretch justify-center gap-1 rounded-md px-1 font-normal hover:bg-accent aria-pressed:bg-accent"
          >
            <span className={cn('h-0.5 rounded-full', index === selected ? 'bg-foreground' : 'bg-border')} />
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {frame ? formatSeconds(frame.timeMs) : '…'}
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

export function ExportDialog() {
  const kind = useUi((state) => state.exportOpen)
  const close = () => setUi({ exportOpen: null })
  return (
    <Dialog open={kind !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <DialogDescription>
            {kind === 'video'
              ? 'Export a flow or the traffic animation as MP4, WebM or GIF. Frames render one by one, so none are dropped.'
              : kind === 'page'
                ? 'Save the diagram as a web page that plays its flows.'
                : kind === 'mermaid'
                  ? 'Copy the diagram as a Mermaid flowchart. GitHub draws Mermaid in Markdown, for example in a README.'
                  : 'Save a PNG or SVG for READMEs, pull requests and slides.'}
          </DialogDescription>
        </DialogHeader>
        <Tabs value={kind ?? 'image'} onValueChange={(value) => setUi({ exportOpen: value as ExportKind })}>
          <TabsList>
            <TabsTrigger value="image">Image</TabsTrigger>
            <TabsTrigger value="video">Animation</TabsTrigger>
            <TabsTrigger value="page">Web page</TabsTrigger>
            <TabsTrigger value="mermaid">Mermaid</TabsTrigger>
          </TabsList>
        </Tabs>
        {kind === 'image' && <ImageExport onClose={close} />}
        {kind === 'video' && <VideoExport onClose={close} />}
        {kind === 'page' && <HtmlExport onClose={close} />}
        {kind === 'mermaid' && <MermaidExport />}
      </DialogContent>
    </Dialog>
  )
}
