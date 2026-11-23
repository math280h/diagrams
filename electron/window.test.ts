import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WindowHooks } from './window'

const electron = vi.hoisted(() => ({ quit: vi.fn() }))

vi.mock('electron', async () => {
  const { EventEmitter: Emitter } = await import('node:events')
  class FakeWebContents extends Emitter {
    setWindowOpenHandler() {}
    reload() {}
    navigationHistory = { canGoBack: () => false, canGoForward: () => false }
  }
  class FakeBrowserWindow extends Emitter {
    webContents = new FakeWebContents()
    private destroyed = false
    isDestroyed() {
      return this.destroyed
    }
    destroy() {
      this.destroyed = true
      this.emit('closed')
    }
    close() {
      let prevented = false
      this.emit('close', { preventDefault: () => (prevented = true) })
      if (!prevented) this.destroy()
    }
    async loadURL() {}
  }
  return {
    app: { on: () => undefined, quit: electron.quit, dock: undefined },
    BrowserWindow: FakeBrowserWindow,
    Menu: { setApplicationMenu: () => undefined },
    nativeTheme: { shouldUseDarkColors: false, themeSource: 'system' },
    shell: { openExternal: async () => undefined },
  }
})

vi.mock('./app-protocol', () => ({ APP_ORIGIN: 'app://diagrams', originOf: (url: string) => new URL(url).origin }))
vi.mock('./paths', () => ({
  APP_NAME: 'Diagrams',
  devServerUrl: () => null,
  iconPath: () => null,
  preloadPath: () => '/app/preload.cjs',
}))
vi.mock('./reports/crash-store', () => ({ isCrashReason: () => false }))
vi.mock('./window-state', () => ({
  loadWindowColors: () => null,
  loadWindowState: () => ({ bounds: null, maximized: false, fullScreen: false }),
  saveWindowColors: () => undefined,
  trackWindowState: () => undefined,
}))

async function loadWindow() {
  vi.resetModules()
  const window = await import('./window')
  const beforeClose = vi.fn(async () => undefined)
  const hooks: WindowHooks = {
    attach: () => undefined,
    beforeClose,
    focused: () => undefined,
    navigated: () => undefined,
    visibilityChanged: () => undefined,
  }
  window.setWindowHooks(hooks)
  return { ...window, beforeClose }
}

describe('prepareQuit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('saves first, and then lets a window close at once', async () => {
    const { createMainWindow, prepareQuit, beforeClose } = await loadWindow()
    const window = createMainWindow(null)
    await prepareQuit()
    expect(beforeClose).toHaveBeenCalledOnce()
    window.close()
    expect(window.isDestroyed()).toBe(true)
    expect(beforeClose).toHaveBeenCalledOnce()
  })

  it('saves again before a window closes after cancelQuit', async () => {
    const { createMainWindow, prepareQuit, cancelQuit, beforeClose } = await loadWindow()
    const window = createMainWindow(null)
    await prepareQuit()
    cancelQuit()
    const done = new Promise<void>((resolve) => window.once('closed', () => resolve()))
    window.close()
    expect(window.isDestroyed()).toBe(false)
    await done
    expect(beforeClose).toHaveBeenCalledTimes(2)
    expect(electron.quit).not.toHaveBeenCalled()
  })
})
