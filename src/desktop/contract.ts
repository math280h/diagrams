export interface StoredFile {
  id: string
  text: string
}

export type FileChange = { kind: 'changed'; id: string; text: string } | { kind: 'removed'; id: string }

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

/** Requests from the renderer to the main process. */
export interface MainRequests {
  'files.list': { input: null; output: { folder: string; files: StoredFile[] } }
  'files.write': { input: StoredFile; output: null }
  'files.remove': { input: { id: string; trash: boolean }; output: null }
  'files.reveal': { input: null; output: null }
  'agent.info': { input: null; output: AgentInfo }
  'agent.resetToken': { input: null; output: AgentInfo }
  'window.setTitleBarColors': { input: { color: string; symbolColor: string }; output: null }
  'update.info': { input: null; output: UpdateInfo }
  /** Checks for an update and resolves when the check ends. A build that installs updates starts the download. */
  'update.check': { input: null; output: UpdateInfo }
  /** Quits the app, installs the downloaded update and starts the app again. */
  'update.install': { input: null; output: null }
}

/** Requests from the main process to the renderer. */
export interface RendererRequests {
  'agent.call': { input: { tool: string; args: unknown }; output: ToolOutcome }
  'handoff.open': { input: { text: string }; output: { diagramId: string; name: string } }
  'app.flush': { input: null; output: null }
}

/** Events from the main process to the renderer. */
export interface MainEvents {
  'files.changed': FileChange
  'agent.info': AgentInfo
  'rpc.cancel': { requestId: string }
  'window.navigation': { canGoBack: boolean; canGoForward: boolean }
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
