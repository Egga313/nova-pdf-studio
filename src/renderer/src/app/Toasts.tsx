/** المنبثقات: تظهر في الزاوية السفلية (جهة البداية) وتختفي تلقائيًا. */
import { clsx } from 'clsx'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui'
import { useNotifications } from '@renderer/stores/notifications'

const ICONS = {
  info: <Info className="h-4 w-4 text-info" />,
  success: <CheckCircle2 className="h-4 w-4 text-success" />,
  warning: <AlertTriangle className="h-4 w-4 text-warning" />,
  error: <XCircle className="h-4 w-4 text-danger" />
}

export function Toasts() {
  const { t } = useTranslation()
  const toasts = useNotifications((s) => s.toasts)
  const dismiss = useNotifications((s) => s.dismissToast)
  if (!toasts.length) return null
  return (
    <div className="pointer-events-none fixed bottom-4 start-4 z-[60] flex w-80 flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={clsx('pointer-events-auto card flex items-start gap-3 px-3.5 py-3 shadow-pop animate-slide-in', {
            'border-danger/40': toast.kind === 'error'
          })}
          style={{ ['--slide-from' as string]: document.dir === 'rtl' ? '16px' : '-16px' }}
        >
          <span className="mt-0.5 shrink-0">{ICONS[toast.kind]}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium leading-tight">{t(toast.titleKey, toast.params)}</p>
            {toast.messageKey && <p className="mt-0.5 text-xs text-muted">{t(toast.messageKey, toast.params)}</p>}
          </div>
          <Button variant="ghost" size="icon" className="-me-1.5 -mt-1.5 h-7 w-7" onClick={() => dismiss(toast.id)} aria-label={t('common.close')}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  )
}
