/**
 * تسجيل معالجات IPC المكتوبة بالأنواع. كل معالج يعيد IpcResult حتى تصل الأخطاء إلى الواجهة
 * كرموز مترجمة، وتُسجَّل التفاصيل التقنية في السجل فقط.
 */
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { AppError } from '@shared/errors'
import type { IpcChannel, IpcRequest, IpcResponse, IpcResult } from '@shared/ipc'
import { logger } from './logger'

type Handler<K extends IpcChannel> = (req: IpcRequest<K>, event: IpcMainInvokeEvent) => Promise<IpcResponse<K>> | IpcResponse<K>

const registered = new Set<string>()

export function handle<K extends IpcChannel>(channel: K, handler: Handler<K>): void {
  if (registered.has(channel)) throw new Error(`IPC handler already registered: ${channel}`)
  registered.add(channel)
  ipcMain.handle(channel, async (event, req: IpcRequest<K>): Promise<IpcResult<IpcResponse<K>>> => {
    try {
      const data = await handler(req, event)
      return { ok: true, data }
    } catch (error) {
      const appError = AppError.wrap(error)
      if (appError.code !== 'CANCELLED' && appError.code !== 'VALIDATION') {
        logger.error(`ipc ${channel} failed`, error)
      }
      return { ok: false, error: appError.serialize() }
    }
  })
}

export function registeredChannels(): string[] {
  return [...registered]
}
