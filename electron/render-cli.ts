import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { app, BrowserWindow } from 'electron'
import type { AgentInfo, UpdateInfo } from '@/desktop/contract'
import { APP_ORIGIN, serveRenderer } from './app-protocol'
import { registerIpc, type MainHandlers } from './ipc'
import { devServerUrl, preloadPath, rendererFolder } from './paths'
import type { RenderArgs } from './render-args'
import { createRendererRpc } from './renderer-rpc'
import { rendererOrigin } from './window'

const RENDER_TIMEOUT_MS = 10 * 60_000

const UNAVAILABLE = 'This request is not available while the app renders a file.'

function refuse(): Promise<never> {
  return Promise.reject(new Error(UNAVAILABLE))
}

const AGENT_OFF: AgentInfo = {
  state: 'failed',
  port: 0,
  url: '',
  token: '',
  message: UNAVAILABLE,
  marketplacePath: null,
}

const UPDATES_OFF: UpdateInfo = {
  state: 'unsupported',
  currentVersion: '',
  version: null,
  installsOnQuit: false,
  message: null,
}

const FOLDER_PREFIX = 'diagrams-render-'
const STALE_FOLDER_MS = 60 * 60_000

function removeFolder(folder: string) {
  try {
    rmSync(folder, { recursive: true, force: true })
  } catch {
    // On Windows, Chromium keeps files in the user data folder open until the process stops.
  }
}

function removeStaleFolders() {
  const now = Date.now()
  for (const name of readdirSync(tmpdir())) {
    if (!name.startsWith(FOLDER_PREFIX)) continue
    const folder = path.join(tmpdir(), name)
    try {
      if (now - statSync(folder).mtimeMs > STALE_FOLDER_MS) removeFolder(folder)
    } catch {
      continue
    }
  }
}

/** Sets a new temporary user data folder, and returns a function that tries to delete it. */
export function isolateRender(): () => void {
  removeStaleFolders()
  const folder = mkdtempSync(path.join(tmpdir(), FOLDER_PREFIX))
  app.setPath('userData', folder)
  return () => removeFolder(folder)
}

/**
 * Renders a diagram file in a hidden window and writes the result.
 *
 * @returns The exit code: 0 after the file is written, 1 after an error.
 */
export async function runRender(args: RenderArgs): Promise<number> {
  try {
    const text = await readFile(args.input, 'utf8')
    const rpc = createRendererRpc()
    const handlers: MainHandlers = {
      'files.list': async () => ({ folder: path.dirname(args.input), files: [] }),
      'files.write': refuse,
      'files.remove': refuse,
      'files.reveal': refuse,
      'files.open': refuse,
      'files.saveAs': refuse,
      'files.show': refuse,
      'files.committed': refuse,
      'agent.info': async () => AGENT_OFF,
      'agent.resetToken': refuse,
      'window.setTitleBarColors': async () => null,
      'update.info': async () => UPDATES_OFF,
      'update.check': async () => UPDATES_OFF,
      'update.install': refuse,
    }
    registerIpc(handlers, rendererOrigin)
    serveRenderer(rendererFolder())
    const window = new BrowserWindow({
      show: false,
      width: 1440,
      height: 900,
      paintWhenInitiallyHidden: true,
      webPreferences: {
        preload: preloadPath(),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        spellcheck: false,
      },
    })
    app.dock?.hide()
    rpc.attach(window.webContents)
    const base = devServerUrl() ?? `${APP_ORIGIN}/index.html`
    void window.loadURL(`${base}#/render`)
    const { data } = await rpc.call(
      'render.file',
      {
        text,
        format: args.format,
        ...(args.maxSizePx !== undefined ? { maxSizePx: args.maxSizePx } : {}),
        ...(args.theme ? { theme: args.theme } : {}),
        ...(args.flow !== undefined ? { flow: args.flow } : {}),
        ...(args.path !== undefined ? { path: args.path } : {}),
        ...(args.step !== undefined ? { step: args.step } : {}),
      },
      { timeoutMs: RENDER_TIMEOUT_MS },
    )
    await writeFile(args.output, Buffer.from(data, 'base64'))
    process.stdout.write(`Wrote ${args.output}\n`)
    window.destroy()
    return 0
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }
}
