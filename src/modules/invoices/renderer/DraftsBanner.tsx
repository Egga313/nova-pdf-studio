/** شريط استرجاع المسودات التلقائية (فواتير لم تُحفظ بسبب إغلاق مفاجئ). */
import { History, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DraftRecord } from '@shared/extras'
import { Button } from '@renderer/components/ui'
import { fmtRelative } from '@renderer/lib/format'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'
import { useTabs } from '@renderer/stores/tabs'

export function DraftsBanner({ refreshKey }: { refreshKey?: unknown }) {
  const { t } = useTranslation()
  const openTab = useTabs((s) => s.open)
  const openTabs = useTabs((s) => s.tabs)
  const [drafts, setDrafts] = useState<DraftRecord[]>([])

  const reload = useCallback(async () => {
    try {
      setDrafts(await invoke('drafts:list', { kind: 'invoice' }))
    } catch {
      setDrafts([])
    }
  }, [])
  useEffect(() => {
    void reload()
  }, [reload, refreshKey])

  // المسودات التي ما تزال تبويباتها مفتوحة ليست "مفقودة"
  const orphan = drafts.filter((d) => !openTabs.some((tab) => `invoice-${tab.id}` === d.id))
  if (!orphan.length) return null

  const restore = async (d: DraftRecord) => {
    try {
      const payload = JSON.parse(d.payload) as { header: Record<string, unknown>; items: Record<string, unknown>[] }
      openTab({ kind: 'invoice', title: d.title || 't:commands.newInvoice', params: { id: null, restore: payload, restoredDraftId: d.id } })
      await invoke('drafts:delete', { id: d.id })
      setDrafts((cur) => cur.filter((x) => x.id !== d.id))
      notify.success('drafts.restored')
    } catch (e) {
      notify.error(e)
    }
  }
  const discard = async (d: DraftRecord) => {
    await invoke('drafts:delete', { id: d.id }).catch(() => undefined)
    setDrafts((cur) => cur.filter((x) => x.id !== d.id))
  }

  return (
    <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-[13px]">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-warning" />
        <span className="flex-1 font-medium">{t('drafts.banner', { count: orphan.length })}</span>
        <Button size="sm" variant="ghost" onClick={() => orphan.forEach((d) => void discard(d))}>{t('drafts.discardAll')}</Button>
      </div>
      <ul className="mt-2 space-y-1">
        {orphan.map((d) => (
          <li key={d.id} className="flex items-center gap-2 rounded-md bg-surface/70 px-2 py-1.5">
            <span className="min-w-0 flex-1 truncate">{d.title || t('commands.newInvoice')}</span>
            <span className="text-[11px] text-muted">{fmtRelative(d.updatedAt, t)}</span>
            <Button size="sm" variant="primary" icon={<RotateCcw className="h-3 w-3" />} onClick={() => void restore(d)}>{t('drafts.restore')}</Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" title={t('drafts.discard')} onClick={() => void discard(d)}><X className="h-3.5 w-3.5" /></Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
