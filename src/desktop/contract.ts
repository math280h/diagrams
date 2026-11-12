import type { GraphvizEngine } from '@/layout/types'

export interface StoredFile {
  id: string
  text: string
  /** The file of a diagram that lives outside the diagrams folder. */
  path?: string
}

export type FileChange = { kind: 'changed'; id: string; text: string; path?: string } | { kind: 'removed'; id: string }

/** The text of a theme file, and its file name without `.theme.json`. */
export interface ThemeSource {
  name: string
  text: string
}

/**
 * The colours of the desktop window in `#rrggbb` form. `controls` and `symbols` colour the window buttons on Windows
 * and Linux. `border` colours the active window border on Windows, and `null` keeps the system colour. `scheme` sets
 * the light or dark look of menus, of the window frame and of `prefers-color-scheme`.
 */
export interface WindowColors {
  controls: string
  symbols: string
  background: string
  border: string | null
  scheme: 'system' | 'dark' | 'light'
}

export type AgentState = 'starting' | 'running' | 'port-in-use' | 'failed'

/** The app and the system it runs on, for bug reports. */
export interface AppAbout {
  version: string
  /** The operating system, its version and the processor architecture, as in `Windows 10.0.26200 (x64)`. */
  system: string
}

export interface AgentInfo {
  state: AgentState
  port: number
  url: string
  token: string
  message: string | null
  /** The folder of the local Claude Code plugin marketplace, or `null` before main writes it. */
  marketplacePath: string | null
  /** The kept port that another program used at this start, before the app moved to `port`, or `null`. */
  movedFrom: number | null
}

/**
 * The state of app updates. `unsupported` means a build that does not update itself, such as a build from source.
 * `sign-in` means a build that gets its updates from a private repository, while the user is not signed in to
 * GitHub. `available` means a new version that the user must download. `ready` means a downloaded update waits for a
 * restart.
 */
export type UpdateState =
  | 'unsupported'
  | 'idle'
  | 'checking'
  | 'sign-in'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'failed'

export interface AppSettings {
  /** If true, the app and its agent server keep running after the window closes, until the user quits. */
  keepRunning: boolean
  /** The origins of the websites that may send diagrams to the app. The list is never empty. */
  websites: string[]
  /** The origin of the website that share links open on. It is one of `websites`. */
  shareWebsite: string
}

export interface UpdateInfo {
  state: UpdateState
  currentVersion: string
  /** The new version, or `null`. */
  version: string | null
  /** True if a downloaded update installs when the app quits. */
  installsOnQuit: boolean
  /** The GitHub repository of the updates, as `owner/name`. */
  repository: string
  message: string | null
}

/**
 * The GitHub sign-in of a build with a GitHub App. `waiting` means that GitHub waits for the user to enter `userCode`
 * at `verificationUri`. `kept` is false when the system has no keychain, so the sign-in ends when the app quits.
 */
export type GitHubSignIn =
  | { state: 'signed-out'; message: string | null }
  | { state: 'waiting'; userCode: string; verificationUri: string }
  | { state: 'signed-in'; kept: boolean }

export type ToolContent = { type: 'text'; text: string } | { type: 'image'; mimeType: 'image/png'; data: string }

export type ToolOutcome = { ok: true; content: ToolContent[] } | { ok: false; message: string }

export type RenderFormat = 'png' | 'svg' | 'gif' | 'mp4' | 'webm'

/** A diagram file to render from the command line. */
export interface RenderRequest {
  text: string
  format: RenderFormat
  /** The id of a theme. Without it and without `themeText`, the theme that the app shows. */
  theme?: string
  /** The text of a theme file to render with. */
  themeText?: string
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

/** A moment of an export stage: the time of the ambient animation and the time in the flow, in milliseconds. */
export interface CaptureMoment {
  ambientMs: number
  timeMs: number
}

/** A request for an image or a video frame of an open stage. */
export interface CaptureRequest {
  sessionId: string
  moment: CaptureMoment
  /** Image pixels for each stage pixel. */
  scale: number
  transparent: boolean
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
  'app.about': { input: null; output: AppAbout }
  'agent.info': { input: null; output: AgentInfo }
  'agent.resetToken': { input: null; output: AgentInfo }
  'window.setColors': { input: WindowColors; output: null }
  /** Returns the theme files in the `themes` folder of the diagrams folder. */
  'themes.list': { input: null; output: ThemeSource[] }
  /** Writes a new theme file in the `themes` folder. It fails when a file with this name exists. */
  'themes.write': { input: ThemeSource; output: null }
  /** Shows the `themes` folder in the file manager, and makes it first when it does not exist. */
  'themes.reveal': { input: null; output: null }
  'app.settings': { input: null; output: AppSettings }
  'app.setKeepRunning': { input: { keepRunning: boolean }; output: AppSettings }
  /** Adds a website to the websites that may send diagrams. The input is an address that the user typed. */
  'app.addWebsite': { input: { website: string }; output: AppSettings }
  /** Removes a website. The last website stays. */
  'app.removeWebsite': { input: { website: string }; output: AppSettings }
  'app.setShareWebsite': { input: { website: string }; output: AppSettings }
  /** Quits the app after the window saves the open diagram. */
  'app.quit': { input: null; output: null }
  'update.info': { input: null; output: UpdateInfo }
  /** Checks for an update and resolves when the check ends. A build that installs updates starts the download. */
  'update.check': { input: null; output: UpdateInfo }
  /** Quits the app, installs the downloaded update and starts the app again. */
  'update.install': { input: null; output: null }
  /**
   * Sets the GitHub repository of updates in a build that allows it, after a check that the repository has a release
   * with an update for this system. `null` sets the repository of the build.
   */
  'update.setRepository': { input: { repository: string | null }; output: UpdateInfo }
  'github.info': { input: null; output: GitHubSignIn }
  /** Starts the GitHub sign-in. The result has the code that the user enters on GitHub. */
  'github.signIn': { input: null; output: GitHubSignIn }
  'github.cancelSignIn': { input: null; output: GitHubSignIn }
  'github.signOut': { input: null; output: GitHubSignIn }
  /** Lays out a DOT text with a Graphviz engine and returns the `plain` output. */
  'layout.graphviz': { input: { dot: string; engine: GraphvizEngine }; output: { plain: string } }
  /**
   * Keeps an export stage for captures in the capture window. The main process keeps up to 16 stages and removes the
   * oldest first. `stage` is the stage description of the renderer, and the main process only passes it on. `width`
   * and `height` are its size in CSS pixels. `fixedViewport` is true for a stage without fit padding and without a
   * flow.
   */
  'capture.open': {
    input: { stage: unknown; width: number; height: number; fixedViewport: boolean }
    output: { sessionId: string }
  }
  /** Returns the stage at a moment as a PNG. */
  'capture.image': { input: CaptureRequest; output: { png: Uint8Array } }
  /** Returns the stage at a moment as RGBA pixels with straight alpha. */
  'capture.frame': { input: CaptureRequest; output: { pixels: Uint8Array; width: number; height: number } }
  'capture.close': { input: { sessionId: string }; output: null }
}

/** Requests from the main process to the renderer. */
export interface RendererRequests {
  'agent.call': { input: { tool: string; args: unknown }; output: ToolOutcome }
  'handoff.open': { input: { text: string }; output: { diagramId: string; name: string } }
  'app.flush': { input: null; output: null }
  /** Opens the "Connect an agent" dialog. */
  'app.connectAgent': { input: null; output: null }
  /** Renders a diagram file and returns the image or the video as base64. */
  'render.file': { input: RenderRequest; output: { data: string } }
  /** Mounts an export stage in the capture window. Below 1, `viewportScale` scales its size and viewport. */
  'capture.mount': { input: { stage: unknown; viewportScale: number }; output: null }
  /**
   * Shows the mounted stage at a moment, with `marker` in the bottom left corner. Waits first until the page zoom of
   * the capture window is `pageZoom`, and resolves after the next paint.
   */
  'capture.render': {
    input: { moment: CaptureMoment; transparent: boolean; marker: number; pageZoom: number }
    output: null
  }
}

/** Events from the main process to the renderer. */
export interface MainEvents {
  'files.changed': FileChange
  /** All theme files, after a change in the `themes` folder. */
  'themes.changed': ThemeSource[]
  'agent.info': AgentInfo
  'rpc.cancel': { requestId: string }
  'window.navigation': { canGoBack: boolean; canGoForward: boolean }
  /** False while the window is minimized or hidden. */
  'window.visibility': { visible: boolean }
  'update.info': UpdateInfo
  'github.info': GitHubSignIn
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
