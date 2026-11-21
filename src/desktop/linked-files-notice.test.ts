import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DesktopApi } from './contract'
import { noticeLinkedFilesReset } from './linked-files-notice'

const toast = vi.hoisted(() => ({ warning: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

function installDesktop(respond: () => Promise<null>) {
  const request = vi.fn(respond)
  vi.stubGlobal('window', { desktop: { request } as unknown as DesktopApi })
  return request
}

describe('noticeLinkedFilesReset', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('tells that the list was reset and shows the copy of the old list on request', () => {
    const request = installDesktop(async () => null)
    noticeLinkedFilesReset({ copyKept: true })
    expect(toast.warning).toHaveBeenCalledOnce()
    const [title, options] = toast.warning.mock.calls[0]!
    expect(title).toBe('The list of opened files was reset')
    expect(options.description).toBe(
      'The app could not read the whole list. Use Open file to open the missing diagram files again. The old list shows where they are.',
    )
    options.action.onClick()
    expect(request).toHaveBeenCalledWith('files.showDamagedList', null)
  })

  it('offers no copy when the app could not keep one', () => {
    installDesktop(async () => null)
    noticeLinkedFilesReset({ copyKept: false })
    const [, options] = toast.warning.mock.calls[0]!
    expect(options.description).toBe(
      'The app could not read the whole list. Use Open file to open the missing diagram files again.',
    )
    expect(options.action).toBeUndefined()
  })

  it('shows why the copy cannot be shown', async () => {
    installDesktop(async () => {
      throw new Error('The app did not keep a copy of the damaged list.')
    })
    noticeLinkedFilesReset({ copyKept: true })
    toast.warning.mock.calls[0]![1].action.onClick()
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledOnce())
  })
})
