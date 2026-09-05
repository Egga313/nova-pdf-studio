/** مساعدات مشتركة لأقسام الإعدادات: حفظ مع إشعار، صف إعداد، مجموعة. */
import type { ReactNode } from 'react'
import type { AppSettings } from '@shared/settings'
import { notify } from '@renderer/stores/notifications'
import { useSettings } from '@renderer/stores/settings'

export function useSaveSettings() {
  const update = useSettings((s) => s.update)
  return async (patch: Partial<AppSettings>, silent = false) => {
    try {
      await update(patch)
      if (!silent) notify.success('settings.saved')
    } catch (e) {
      notify.error(e)
    }
  }
}

export function Group({ title, hint, children }: { title?: string; hint?: string; children: ReactNode }) {
  return (
    <section className="card mb-4 p-5">
      {title && <h3 className="text-[13px] font-semibold">{title}</h3>}
      {hint && <p className="mb-3 mt-0.5 text-xs text-muted">{hint}</p>}
      <div className={title || hint ? 'mt-3' : ''}>{children}</div>
    </section>
  )
}

export function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-0">
      <div className="min-w-0">
        <div className="text-[13px]">{label}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
      <div className="w-56 shrink-0">{children}</div>
    </div>
  )
}
