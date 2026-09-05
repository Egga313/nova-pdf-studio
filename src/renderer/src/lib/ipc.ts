/** عميل IPC المكتوب بالأنواع في الواجهة: invoke(channel, req) يعيد البيانات أو يرمي AppError. */
import { AppError } from '@shared/errors'
import type { IpcChannel, IpcEventName, IpcEvents, IpcRequest, IpcResponse } from '@shared/ipc'

export async function invoke<K extends IpcChannel>(
  channel: K,
  ...args: IpcRequest<K> extends void ? [] : [IpcRequest<K>]
): Promise<IpcResponse<K>> {
  const bridge = window.nova
  if (!bridge) throw new AppError('UNKNOWN', 'errors.NO_BRIDGE')
  const result = await bridge.invoke(channel, args[0])
  if (result.ok) return result.data as IpcResponse<K>
  throw AppError.fromSerialized(result.error)
}

export function onMainEvent<E extends IpcEventName>(event: E, listener: (payload: IpcEvents[E]) => void): () => void {
  if (!window.nova) return () => undefined
  return window.nova.on(event, (payload) => listener(payload as IpcEvents[E]))
}

/** يسجّل خطأ في سجل المطوّر دون إزعاج المستخدم. */
export function logToMain(level: 'info' | 'warn' | 'error', message: string, details?: unknown): void {
  const text = details instanceof Error ? `${details.message}\n${details.stack ?? ''}` : details === undefined ? undefined : safeJson(details)
  void invoke('app:log', { level, message, details: text }).catch(() => undefined)
}

function safeJson(value: unknown): string {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    return String(value)
  }
}
