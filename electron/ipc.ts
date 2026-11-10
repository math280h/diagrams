import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { HEX_COLOR_PATTERN } from '@/desktop/constants'
import { IPC_CHANNELS, type MainRequests } from '@/desktop/contract'
import { MAX_PAGE_ZOOM } from '@/export/capture-plan'
import { GRAPHVIZ_ENGINES } from '@/layout/types'
import { originOf } from './app-protocol'

export type MainHandlers = {
  [M in keyof MainRequests]: (input: MainRequests[M]['input']) => Promise<MainRequests[M]['output']>
}

const HEX_COLOR = z.string().regex(HEX_COLOR_PATTERN)
/** The longest DOT text that the main process lays out. */
const MAX_DOT_CHARS = 2_000_000
/** The largest side of an export stage in CSS pixels. */
const MAX_STAGE_SIDE_PX = 1_000_000

const CAPTURE = z.object({
  sessionId: z.uuid(),
  moment: z.object({ ambientMs: z.number().finite(), timeMs: z.number().finite() }),
  scale: z.number().positive().max(MAX_PAGE_ZOOM),
  transparent: z.boolean(),
})

const INPUTS = {
  'files.list': z.null(),
  'files.write': z.object({ id: z.string(), text: z.string() }),
  'files.remove': z.object({ id: z.string(), trash: z.boolean() }),
  'files.reveal': z.null(),
  'files.open': z.null(),
  'files.saveAs': z.object({ name: z.string().max(200), text: z.string() }),
  'files.show': z.object({ id: z.string() }),
  'files.committed': z.object({ id: z.string() }),
  'app.about': z.null(),
  'agent.info': z.null(),
  'agent.resetToken': z.null(),
  'agent.changePort': z.null(),
  'window.setTitleBarColors': z.object({ color: HEX_COLOR, symbolColor: HEX_COLOR }),
  'update.info': z.null(),
  'update.check': z.null(),
  'update.install': z.null(),
  'layout.graphviz': z.object({ dot: z.string().max(MAX_DOT_CHARS), engine: z.enum(GRAPHVIZ_ENGINES) }),
  'capture.open': z.object({
    stage: z.unknown(),
    width: z.number().positive().max(MAX_STAGE_SIDE_PX),
    height: z.number().positive().max(MAX_STAGE_SIDE_PX),
    fixedViewport: z.boolean(),
  }),
  'capture.image': CAPTURE,
  'capture.frame': CAPTURE,
  'capture.close': z.object({ sessionId: z.uuid() }),
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
