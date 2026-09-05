/** مركز الإشعارات: لوحة منزلقة تعرض سجل الإشعارات داخل الجلسة. */
import { Bell, CheckCheck, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, EmptyState } from '@renderer/components/ui'
import { fmtDate } from '@renderer/lib/format'
import { useNotifications } from '@renderer/stores/notifications'

export function NotificationCenter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const items = useNotifications((s) => s.items)
  const markAllRead = useNotifications((s) => s.markAllRead)
  const clear = useNotifications((s) => s.clear)
  if (!open) return null
  return (
    <>
      <div className="fixed inset-0 z-40" onMouseDown={onClose} />
      <aside className="card fixed top-12 end-3 z-50 flex w-[360px] max-h-[70vh] flex-col overflow-hidden shadow-pop animate-scale-in">
        <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h3 className="text-[13px] font-semibold">{t('notifications.title')}</h3>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={markAllRead} icon={<CheckCheck className="h-3.5 w-3.5" />}>{t('notifications.markAllRead')}</Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={clear} aria-label={t('notifications.clear')}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        </header>
        <div className="overflow-y-auto">
          {items.length === 0 ? (
            <EmptyState icon={<Bell className="h-6 w-6" />} title={t('notifications.empty')} />
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => (
                <li key={n.id} className="flex gap-3 px-4 py-3">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-border' : n.kind === 'error' ? 'bg-danger' : n.kind === 'success' ? 'bg-success' : n.kind === 'warning' ? 'bg-warning' : 'bg-info'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">{t(n.titleKey, n.params)}</p>
                    {n.messageKey && <p className="text-xs text-muted">{t(n.messageKey, n.params)}</p>}
                    <p className="mt-0.5 text-[11px] text-muted/70 ltr-text">{fmtDate(n.createdAt, true)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  )
}
