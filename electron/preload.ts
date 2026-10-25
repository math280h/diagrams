import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IPC_CHANNELS,
  type DesktopApi,
  type MainEvent,
  type RendererCall,
  type RendererReply,
} from '@/desktop/contract'
import { errorMessage } from '@/lib/error-message'

const api: DesktopApi = {
  platform: process.platform,
  request: (method, input) => ipcRenderer.invoke(IPC_CHANNELS.request, method, input),
  on(name, listener) {
    const handler = (_event: IpcRendererEvent, message: MainEvent) => {
      if (message.name === name) listener(message.payload as never)
    }
    ipcRenderer.on(IPC_CHANNELS.event, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.event, handler)
  },
  serve(handler) {
    const listener = (_event: IpcRendererEvent, call: RendererCall) => {
      const send = (reply: RendererReply) => ipcRenderer.send(IPC_CHANNELS.reply, reply)
      handler(call).then(
        (value) => send({ requestId: call.requestId, ok: true, value }),
        (error: unknown) =>
          send({
            requestId: call.requestId,
            ok: false,
            message: errorMessage(error),
          }),
      )
    }
    ipcRenderer.on(IPC_CHANNELS.call, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.call, listener)
  },
  ready: () => ipcRenderer.send(IPC_CHANNELS.ready),
}

contextBridge.exposeInMainWorld('desktop', api)
