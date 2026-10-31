import type { GraphvizEngine } from '@/layout/types'

export interface StoredFile {
  id: string
  text: string
  /** The file of a diagram that lives outside the diagrams folder. */
  path?: string
}

export type FileChange = { kind: 'changed'; id: string; text: string; path?: string } | { kind: 'removed'; id: string }

export type AgentState = 'starting' | 'running' | 'port-in-use' | 'failed'

export interface AgentInfo {
  state: AgentState
  port: number
  url: string
  token: string
  message: string | null
  /** The folder of the local Claude Code plugin marketplace, or `null` before main writes it. */
  marketplacePath: string | null
}

/**
 * The state of app updates. `unsupported` means a build that does not update itself, such as a build from source.
 * `available` means a new version that the user must download. `ready` means a downloaded update waits for a restart.
 */
export type UpdateState = 'unsupported' | 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'failed'

export interface UpdateInfo {
  state: UpdateState
  currentVersion: string
  /** The new version, or `null`. */
  version: string | null
  /** True if a downloaded update installs when the app quits. */
  installsOnQuit: boolean
  message: string | null
}

export type ToolContent = { type: 'text'; text: string } | { type: 'image'; mimeType: 'image/png'; data: string }

export type ToolOutcome = { ok: true; content: ToolContent[] } | { ok: false; message: string }

export type RenderFormat = 'png' | 'svg' | 'gif' | 'mp4' | 'webm'

/** A diagram file to render from the command line. */
export interface RenderRequest {
  text: string
  format: RenderFormat
  theme?: 'dark' | 'light'
  /** The flow to show or play: its name or its id. */
  flow?: string
  /** With `flow`: the path to show or play, by its name or its id. Without it, the main steps. */
  path?: string
  /** With `flow` and an image format: the step from 0 to show. */
  step?: number
  /**
   * The longest side of the output, in pixels. Without it, an image is at most 2048 pixels and a video keeps its frame
   * size.
   */
  maxSizePx?: number
}

/** Requests from the renderer to the main process. */
export interface MainRequests {
  'files.list': { input: null; output: { folder: string; files: StoredFile[] } }
  'files.write': { input: StoredFile; output: null }
  'files.remove': { input: { id: string; trash: boolean }; output: null }
  'files.reveal': { input: null; output: null }
  /** Asks the user for diagram files anywhere and links them, so that the app saves them where they are. */
  'files.open': { input: null; output: StoredFile[] }
  /** Asks the user where to save a new diagram file, writes it there and links it. `null` means that the user cancelled. */
  'files.saveAs': { input: { name: string; text: string }; output: StoredFile | null }
  /** Shows a linked file in the file manager. */
  'files.show': { input: { id: string }; output: null }
  /** Returns a linked file as the last commit of its git repository holds it. */
  'files.committed': { input: { id: string }; output: { text: string } }
  'agent.info': { input: null; output: AgentInfo }
  'agent.resetToken': { input: null; output: AgentInfo }
  'window.setTitleBarColors': { input: { color: string; symbolColor: string }; output: null }
  'update.info': { input: null; output: UpdateInfo }
  /** Checks for an update and resolves when the check ends. A build that installs updates starts the download. */
  'update.check': { input: null; output: UpdateInfo }
  /** Quits the app, installs the downloaded update and starts the app again. */
  'update.install': { input: null; output: null }
  /** Lays out a DOT text with a Graphviz engine and returns the `plain` output. */
  'layout.graphviz': { input: { dot: string; engine: GraphvizEngine }; output: { plain: string } }
}

/** Requests from the main process to the renderer. */
export interface RendererRequests {
  'agent.call': { input: { tool: string; args: unknown }; output: ToolOutcome }
  'handoff.open': { input: { text: string }; output: { diagramId: string; name: string } }
  'app.flush': { input: null; output: null }
  /** Renders a diagram file and returns the image or the video as base64. */
  'render.file': { input: RenderRequest; output: { data: string } }
}

/** Events from the main process to the renderer. */
export interface MainEvents {
  'files.changed': FileChange
  'agent.info': AgentInfo
  'rpc.cancel': { requestId: string }
  'window.navigation': { canGoBack: boolean; canGoForward: boolean }
  /** False while the window is minimized or hidden. */
  'window.visibility': { visible: boolean }
  'update.info': UpdateInfo
}

export const IPC_CHANNELS = {
  request: 'dg:request',
  call: 'dg:call',
  reply: 'dg:reply',
  event: 'dg:event',
  ready: 'dg:ready',
} as const

export interface RendererCall<M extends keyof RendererRequests = keyof RendererRequests> {
  requestId: string
  method: M
  input: RendererRequests[M]['input']
}

export type RendererReply =
  | { requestId: string; ok: true; value: unknown }
  | { requestId: string; ok: false; message: string }

export interface MainEvent<E extends keyof MainEvents = keyof MainEvents> {
  name: E
  payload: MainEvents[E]
}

/** The API that the preload script puts on `window.desktop`. */
export interface DesktopApi {
  platform: string
  request<M extends keyof MainRequests>(method: M, input: MainRequests[M]['input']): Promise<MainRequests[M]['output']>
  on<E extends keyof MainEvents>(name: E, listener: (payload: MainEvents[E]) => void): () => void
  /** Answers requests from the main process. The promise of the handler becomes the reply. */
  serve(handler: (call: RendererCall) => Promise<unknown>): () => void
  /** Tells the main process that the renderer can answer requests. */
  ready(): void
}
