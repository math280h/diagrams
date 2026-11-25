import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WindowHooks } from './window'

const electron = vi.hoisted(() => ({ quit: vi.fn() }))

vi.mock('electron', async () => {
  const { EventEmitter: Emitter } = await import('node:events')
  class FakeWebContents extends Emitter {
    setWindowOpenHandler() {}
    reload() {}
    reloadIgnoringCache() {}
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
    isMinimized() {
      return false
    }
    show() {}
    focus() {}
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
  const beforeClose = vi.fn<WindowHooks['beforeClose']>(async () => null)
  const confirmUnsavedClose = vi.fn<WindowHooks['confirmUnsavedClose']>(async () => true)
  const hooks: WindowHooks = {
    attach: () => undefined,
    beforeClose,
    confirmUnsavedClose,
    focused: () => undefined,
    navigated: () => undefined,
    visibilityChanged: () => undefined,
  }
  window.setWindowHooks(hooks)
  return { ...window, beforeClose, confirmUnsavedClose }
}

const UNSAVED = { name: 'Shop', text: '{}' }

function closed(window: { once(event: 'closed', listener: () => void): unknown }) {
  return new Promise<void>((resolve) => window.once('closed', () => resolve()))
}

describe('close of a window with an unsaved diagram', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stays open when the user keeps it, and closes after the next answer', async () => {
    const { createMainWindow, beforeClose, confirmUnsavedClose } = await loadWindow()
    beforeClose.mockResolvedValue(UNSAVED)
    confirmUnsavedClose.mockResolvedValueOnce(false)
    const window = createMainWindow(null)
    window.close()
    await vi.waitFor(() => expect(confirmUnsavedClose).toHaveBeenCalledOnce())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(window.isDestroyed()).toBe(false)

    const done = closed(window)
    window.close()
    await done
    expect(confirmUnsavedClose).toHaveBeenCalledTimes(2)
    expect(electron.quit).not.toHaveBeenCalled()
  })

  it('closes without a question when the diagram is saved, or when the system session ends', async () => {
    const { createMainWindow, endSession, beforeClose, confirmUnsavedClose } = await loadWindow()
    const saved = createMainWindow(null)
    const savedDone = closed(saved)
    saved.close()
    await savedDone

    beforeClose.mockResolvedValue(UNSAVED)
    endSession()
    const unsaved = createMainWindow(null)
    const unsavedDone = closed(unsaved)
    unsaved.close()
    await unsavedDone
    expect(confirmUnsavedClose).not.toHaveBeenCalled()
  })

  it('closes when the system session ends while the question shows', async () => {
    const { createMainWindow, endSession, beforeClose, confirmUnsavedClose } = await loadWindow()
    beforeClose.mockResolvedValue(UNSAVED)
    confirmUnsavedClose.mockImplementation(
      (_window, _unsaved, signal) =>
        new Promise((resolve) => signal.addEventListener('abort', () => resolve(false), { once: true })),
    )
    const window = createMainWindow(null)
    const done = closed(window)
    window.close()
    await vi.waitFor(() => expect(confirmUnsavedClose).toHaveBeenCalledOnce())
    endSession()
    await done
  })

  it('delays the end of a Windows session only while the diagram is not saved', async () => {
    const { createMainWindow, setRendererUnsaved } = await loadWindow()
    const window = createMainWindow(null)
    const preventDefault = vi.fn()
    window.emit('query-session-end', { preventDefault })
    expect(preventDefault).not.toHaveBeenCalled()
    setRendererUnsaved(true)
    window.emit('query-session-end', { preventDefault })
    expect(preventDefault).toHaveBeenCalledOnce()
  })

  it('does not prepare the quit while the user keeps the window open', async () => {
    const { createMainWindow, prepareQuit, beforeClose, confirmUnsavedClose } = await loadWindow()
    beforeClose.mockResolvedValue(UNSAVED)
    confirmUnsavedClose.mockResolvedValueOnce(false)
    const window = createMainWindow(null)
    expect(await prepareQuit()).toBe(false)
    const done = closed(window)
    window.close()
    await done
    expect(beforeClose).toHaveBeenCalledTimes(2)
  })
})

describe('reloadMainWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('saves the open diagram first, and then reloads the page', async () => {
    const { createMainWindow, reloadMainWindow, beforeClose, confirmUnsavedClose } = await loadWindow()
    const window = createMainWindow(null)
    const reload = vi.spyOn(window.webContents, 'reload')
    await reloadMainWindow(false)
    expect(beforeClose).toHaveBeenCalledOnce()
    expect(confirmUnsavedClose).not.toHaveBeenCalled()
    expect(reload).toHaveBeenCalledOnce()
    expect(window.isDestroyed()).toBe(false)
  })

  it('asks first when the diagram is not saved, and keeps the page when the user does not reload', async () => {
    const { createMainWindow, reloadMainWindow, beforeClose, confirmUnsavedClose } = await loadWindow()
    beforeClose.mockResolvedValue(UNSAVED)
    confirmUnsavedClose.mockResolvedValueOnce(false)
    const window = createMainWindow(null)
    const reload = vi.spyOn(window.webContents, 'reload')
    const reloadIgnoringCache = vi.spyOn(window.webContents, 'reloadIgnoringCache')
    await reloadMainWindow(false)
    expect(confirmUnsavedClose).toHaveBeenCalledWith(window, UNSAVED, expect.any(AbortSignal), 'reload')
    expect(reload).not.toHaveBeenCalled()

    await reloadMainWindow(true)
    expect(reloadIgnoringCache).toHaveBeenCalledOnce()
    expect(reload).not.toHaveBeenCalled()
  })

  it('reloads once when the user asks again while the first reload waits for the save', async () => {
    const { createMainWindow, reloadMainWindow } = await loadWindow()
    const window = createMainWindow(null)
    const reload = vi.spyOn(window.webContents, 'reload')
    await Promise.all([reloadMainWindow(false), reloadMainWindow(false)])
    expect(reload).toHaveBeenCalledOnce()
  })
})

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
