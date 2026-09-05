import type { IpcChannel, IpcEventName, IpcResult } from '@shared/ipc'

export interface NovaBridge {
  invoke(channel: IpcChannel, req: unknown): Promise<IpcResult<unknown>>
  on(event: IpcEventName, listener: (payload: unknown) => void): () => void
  platform: string
}

declare global {
  interface Window {
    nova: NovaBridge
  }
}

export {}
