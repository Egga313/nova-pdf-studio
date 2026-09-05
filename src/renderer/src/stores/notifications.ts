/** الإشعارات: منبثقات (Toast) قصيرة + مركز إشعارات يحتفظ بالسجل داخل الجلسة. */
import { create } from 'zustand'
import type { Notification } from '@shared/entities'
import { AppError } from '@shared/errors'
import { logToMain } from '@renderer/lib/ipc'

interface Toast extends Notification {
  durationMs: number
}

interface NotificationsState {
  items: Notification[]
  toasts: Toast[]
  unread: number
  notify: (n: Omit<Notification, 'id' | 'createdAt' | 'read'> & { durationMs?: number; silent?: boolean }) => string
  error: (error: unknown, titleKey?: string) => void
  dismissToast: (id: string) => void
  markAllRead: () => void
  clear: () => void
}

let seq = 0

export const useNotifications = create<NotificationsState>((set, get) => ({
  items: [],
  toasts: [],
  unread: 0,

  notify: ({ durationMs, silent, ...rest }) => {
    const id = `n-${Date.now().toString(36)}-${(seq++).toString(36)}`
    const item: Notification = { ...rest, id, createdAt: new Date().toISOString(), read: false }
    const toast: Toast = { ...item, durationMs: durationMs ?? (rest.kind === 'error' ? 7000 : 3500) }
    set((s) => ({
      items: [item, ...s.items].slice(0, 100),
      toasts: silent ? s.toasts : [...s.toasts, toast].slice(-4),
      unread: s.unread + 1
    }))
    if (!silent) setTimeout(() => get().dismissToast(id), toast.durationMs)
    return id
  },

  error: (error, titleKey = 'toast.error') => {
    const appError = AppError.wrap(error)
    logToMain('error', `ui error: ${appError.messageKey}`, appError.details ?? appError.message)
    get().notify({ kind: 'error', titleKey, messageKey: appError.messageKey, params: appError.params })
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  markAllRead: () => set((s) => ({ items: s.items.map((i) => ({ ...i, read: true })), unread: 0 })),
  clear: () => set({ items: [], unread: 0 })
}))

/** اختصارات مريحة للاستخدام خارج المكوّنات. */
export const notify = {
  success: (titleKey: string, params?: Record<string, string | number>) =>
    useNotifications.getState().notify({ kind: 'success', titleKey, params }),
  info: (titleKey: string, params?: Record<string, string | number>) =>
    useNotifications.getState().notify({ kind: 'info', titleKey, params }),
  warning: (titleKey: string, params?: Record<string, string | number>) =>
    useNotifications.getState().notify({ kind: 'warning', titleKey, params }),
  error: (error: unknown, titleKey?: string) => useNotifications.getState().error(error, titleKey)
}
