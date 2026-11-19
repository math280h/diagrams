import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CrashRecord, DesktopApi, MainEvents } from '@/desktop/contract'
import { watchCrashes } from './crashes'
import { useReportDialogs } from './report-store'

const toast = vi.hoisted(() => ({ error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

function crash(id: string, process: string, time: number): CrashRecord {
  return { id, time, process, reason: 'crashed', exitCode: null, dump: null, seen: false }
}

function installDesktop(initial: CrashRecord[]) {
  let listener: ((payload: MainEvents['reports.crashes']) => void) | null = null
  let crashes = initial
  const desktop = {
    platform: 'darwin',
    request: vi.fn(async (method: string) => {
      if (method === 'reports.markSeen') crashes = crashes.map((item) => ({ ...item, seen: true }))
      return crashes
    }),
    on: (_name: string, next: (payload: MainEvents['reports.crashes']) => void) => {
      listener = next
      return () => undefined
    },
    serve: () => () => undefined,
    ready: () => undefined,
  } as unknown as DesktopApi
  vi.stubGlobal('window', { desktop })
  return {
    emit: (next: CrashRecord[]) => {
      crashes = next
      listener?.(next)
    },
  }
}

async function settle() {
  for (let index = 0; index < 5; index++) await Promise.resolve()
}

describe('crash notices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useReportDialogs.setState({ subject: null })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('tells about a crash of the main process before a newer crash of another process', async () => {
    installDesktop([crash('event-2', 'gpu', 2), crash('dump-1', 'main', 1)])
    watchCrashes()
    await settle()
    expect(toast.error).toHaveBeenCalledOnce()
    const [title, options] = toast.error.mock.calls[0]!
    expect(title).toBe('The app stopped unexpectedly')
    options.action.onClick()
    expect(useReportDialogs.getState().subject).toMatchObject({ kind: 'crash', crash: { id: 'dump-1', seen: true } })
  })

  it('keeps the notice of a crash when a later crash comes', async () => {
    const { emit } = installDesktop([crash('dump-1', 'main', 1)])
    watchCrashes()
    await settle()
    emit([crash('event-2', 'gpu', 2), { ...crash('dump-1', 'main', 1), seen: true }])
    await settle()
    const notices = toast.error.mock.calls.map(([title, options]) => [title, options.id])
    expect(notices).toEqual([
      ['The app stopped unexpectedly', 'crash-notice-dump-1'],
      ['The graphics process stopped unexpectedly', 'crash-notice-event-2'],
    ])
  })
})
