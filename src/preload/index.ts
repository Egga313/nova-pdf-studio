/** جسر آمن بين الواجهة والعملية الرئيسية: قنوات محصورة بالعقد، ولا يُكشف أي شيء من Node. */
import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type IpcChannel, type IpcEventName, type IpcResult } from '@shared/ipc'

const allowed = new Set<string>(IPC_CHANNELS)
const allowedEvents = new Set<IpcEventName>(['app:open-file-request', 'app:lock', 'backup:completed'])

const api = {
  invoke: async (channel: IpcChannel, req: unknown): Promise<IpcResult<unknown>> => {
    if (!allowed.has(channel)) {
      return { ok: false, error: { __appError: true, code: 'UNKNOWN', messageKey: 'errors.UNKNOWN', details: `channel not allowed: ${channel}` } }
    }
    return ipcRenderer.invoke(channel, req) as Promise<IpcResult<unknown>>
  },
  on: (event: IpcEventName, listener: (payload: unknown) => void): (() => void) => {
    if (!allowedEvents.has(event)) return () => undefined
    const wrapped = (_e: Electron.IpcRendererEvent, payload: unknown) => listener(payload)
    ipcRenderer.on(event, wrapped)
    return () => ipcRenderer.removeListener(event, wrapped)
  },
  platform: process.platform
}

contextBridge.exposeInMainWorld('nova', api)

export type NovaBridge = typeof api
