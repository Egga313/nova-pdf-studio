/** سجل التدقيق: كل عملية مهمة (فواتير، مدفوعات، عملاء، إعدادات، نسخ، أمان…) مع بحث وتصفية وتصدير CSV. */
import { clsx } from 'clsx'
import { Download, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AuditLog } from '@shared/entities'
import type { TabComponentProps } from '@renderer/app/tabRegistry'
import { Badge, Button, EmptyState, Input, Select } from '@renderer/components/ui'
import { fmtDate } from '@renderer/lib/format'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'
import { useTabs } from '@renderer/stores/tabs'

const TONE: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'accent' | 'neutral'> = {
  created: 'success', added: 'success', loaded: 'success', imported: 'success', restored: 'info', updated: 'info', changed: 'info', exported: 'info',
  deleted: 'danger', purged: 'danger', removed: 'danger', cleared: 'danger', pin_set: 'accent', pin_removed: 'warning'
}

export function AuditTab({ tab }: TabComponentProps) {
  const { t } = useTranslation()
  const openTab = useTabs((s) => s.open)
  const [rows, setRows] = useState<AuditLog[]>([])
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('')
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      setRows(await invoke('audit:list', { limit: 1000 }))
    } catch (e) {
      notify.error(e)
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])
  useEffect(() => useTabs.subscribe((s, prev) => {
    if (s.activeId === tab.id && prev.activeId !== tab.id) void reload()
  }), [reload, tab.id])

  const groups = useMemo(() => [...new Set(rows.map((r) => r.action.split('.')[0]))].sort(), [rows])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => (!group || r.action.startsWith(`${group}.`)) && (!q || `${r.action} ${r.objectType ?? ''} ${r.objectId ?? ''} ${r.summary ?? ''}`.toLowerCase().includes(q)))
  }, [rows, query, group])

  const label = (action: string) => t(`audit.actions.${action}`, { defaultValue: action })
  const tone = (action: string) => TONE[action.split('.')[1] ?? ''] ?? 'neutral'

  const openObject = (r: AuditLog) => {
    const id = Number(r.objectId)
    if (!id) return
    if (r.objectType === 'invoice') openTab({ id: `invoice-${id}`, kind: 'invoice', title: r.summary ?? String(id), params: { id } })
    else if (r.objectType === 'customer') openTab({ id: `customer-${id}`, kind: 'customer', title: r.summary ?? String(id), params: { id } })
    else if (r.objectType === 'spreadsheet') openTab({ id: `sheet-db-${id}`, kind: 'spreadsheet', title: r.summary ?? String(id), params: { id } })
  }

  const exportCsv = async () => {
    const target = await invoke('dialog:save-file', { defaultPath: `audit-log-${new Date().toISOString().slice(0, 10)}.csv`, filters: [{ name: 'CSV', extensions: ['csv'] }] })
    if (!target) return
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = [['time', 'action', 'object_type', 'object_id', 'summary'].join(','), ...filtered.map((r) => [r.createdAt, r.action, r.objectType, r.objectId, r.summary].map(esc).join(','))]
    await invoke('file:write', { path: target, data: new TextEncoder().encode('﻿' + lines.join('\n')) })
    notify.success('audit.exported')
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border bg-surface px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight"><ShieldCheck className="h-5 w-5 text-accent" />{t('audit.title')}</h1>
            <p className="text-xs text-muted">{t('audit.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void reload()}>{t('common.retry')}</Button>
            <Button size="sm" variant="outline" icon={<Download className="h-3.5 w-3.5" />} disabled={!filtered.length} onClick={() => void exportCsv()}>{t('audit.export')}</Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('audit.search')} className="ps-9" />
          </div>
          <Select value={group} onChange={(e) => setGroup(e.target.value)} className="w-48">
            <option value="">{t('audit.allGroups')}</option>
            {groups.map((g) => <option key={g} value={g}>{t(`audit.groups.${g}`, { defaultValue: g })}</option>)}
          </Select>
          <span className="text-xs text-muted">{t('audit.count', { count: filtered.length })}</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-5">
        {!loading && filtered.length === 0 ? (
          <div className="card"><EmptyState icon={<ShieldCheck className="h-6 w-6" />} title={t('audit.emptyTitle')} body={t('audit.emptyBody')} /></div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2/60 text-[11.5px] text-muted">
                <tr>
                  <th className="px-4 py-2 text-start font-medium">{t('audit.cols.time')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('audit.cols.action')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('audit.cols.object')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('audit.cols.summary')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => (
                  <tr key={r.id} className={clsx('hover:bg-surface-2/40', r.objectId && ['invoice', 'customer', 'spreadsheet'].includes(r.objectType ?? '') && 'cursor-pointer')} onDoubleClick={() => openObject(r)}>
                    <td className="whitespace-nowrap px-4 py-2 text-muted ltr-text">{fmtDate(r.createdAt, true)}</td>
                    <td className="px-3 py-2"><Badge tone={tone(r.action)}>{label(r.action)}</Badge></td>
                    <td className="px-3 py-2 text-muted">{r.objectType ? `${t(`audit.objects.${r.objectType}`, { defaultValue: r.objectType })}${r.objectId ? ` #${r.objectId}` : ''}` : '—'}</td>
                    <td className="max-w-[480px] truncate px-3 py-2" dir="auto">{r.summary ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
