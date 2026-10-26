import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { HEX_COLOR_PATTERN } from '@/desktop/constants'
import { IPC_CHANNELS, type MainRequests } from '@/desktop/contract'
import { originOf } from './app-protocol'

export type MainHandlers = {
  [M in keyof MainRequests]: (input: MainRequests[M]['input']) => Promise<MainRequests[M]['output']>
}

const HEX_COLOR = z.string().regex(HEX_COLOR_PATTERN)

const INPUTS = {
  'files.list': z.null(),
  'files.write': z.object({ id: z.string(), text: z.string() }),
  'files.remove': z.object({ id: z.string(), trash: z.boolean() }),
  'files.reveal': z.null(),
  'agent.info': z.null(),
  'agent.resetToken': z.null(),
  'window.setTitleBarColors': z.object({ color: HEX_COLOR, symbolColor: HEX_COLOR }),
  'update.info': z.null(),
  'update.check': z.null(),
  'update.install': z.null(),
} satisfies { [M in keyof MainRequests]: z.ZodType<MainRequests[M]['input']> }

function isRequest(method: unknown): method is keyof MainRequests {
  return typeof method === 'string' && Object.hasOwn(INPUTS, method)
}

/**
 * Answers renderer requests.
 *
 * @param trustedOrigin - Returns the only page origin that may send requests.
 */
export function registerIpc(handlers: MainHandlers, trustedOrigin: () => string) {
  ipcMain.handle(IPC_CHANNELS.request, async (event: IpcMainInvokeEvent, method: unknown, input: unknown) => {
    const url = event.senderFrame?.url
    if (!url || originOf(url) !== trustedOrigin()) throw new Error('This page may not use the desktop API.')
    if (!isRequest(method)) throw new Error(`Unknown request: ${String(method)}`)
    const parsed = INPUTS[method].parse(input)
    const handler = handlers[method] as (value: unknown) => Promise<unknown>
    return handler(parsed)
  })
}
