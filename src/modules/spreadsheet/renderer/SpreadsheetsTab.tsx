/** قائمة الجداول المحفوظة: إنشاء/فتح ملف/فتح سجل، سلة محذوفات مع استرجاع وحذف نهائي. */
import { clsx } from 'clsx'
import { FileSpreadsheet, FolderOpen, Plus, RotateCcw, Search, Table2, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SpreadsheetRecord } from '@shared/spreadsheets'
import { pickAndOpenSpreadsheet } from '@renderer/app/openFile'
import type { TabComponentProps } from '@renderer/app/tabRegistry'
import { Badge, Button, EmptyState, Input } from '@renderer/components/ui'
import { fmtDate } from '@renderer/lib/format'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'
import { useSettings } from '@renderer/stores/settings'
import { useTabs } from '@renderer/stores/tabs'

export function SpreadsheetsTab({ tab }: TabComponentProps) {
  const { t } = useTranslation()
  const confirmDelete = useSettings((s) => s.settings.general.confirmBeforeDelete)
  const openTab = useTabs((s) => s.open)
  const [rows, setRows] = useState<SpreadsheetRecord[]>([])
  const [query, setQuery] = useState('')
  const [showTrash, setShowTrash] = useState(false)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      setRows(await invoke('spreadsheets:list', { query, includeDeleted: showTrash, limit: 500 }))
    } catch (e) {
      notify.error(e)
    } finally {
      setLoading(false)
    }
  }, [query, showTrash])

  useEffect(() => {
    const h = setTimeout(() => void reload(), 120)
    return () => clearTimeout(h)
  }, [reload])
  useEffect(() => {
    return useTabs.subscribe((s, prev) => {
      if (s.activeId === tab.id && prev.activeId !== tab.id) void reload()
    })
  }, [reload, tab.id])

  const openRecord = (r: SpreadsheetRecord) => openTab({ id: `sheet-db-${r.id}`, kind: 'spreadsheet', title: r.title, params: { id: r.id }, icon: 'sheet' })
  const newSheet = () => openTab({ kind: 'spreadsheet', title: 't:commands.newSpreadsheet', params: { path: null } })
  const remove = async (r: SpreadsheetRecord) => {
    if (confirmDelete && !window.confirm(t('sheet.confirmDelete', { title: r.title }))) return
    try {
      await invoke('spreadsheets:delete', { id: r.id })
      await reload()
    } catch (e) {
      notify.error(e)
    }
  }
  const restore = async (r: SpreadsheetRecord) => {
    try {
      await invoke('spreadsheets:restore', { id: r.id })
      await reload()
    } catch (e) {
      notify.error(e)
    }
  }
  const purge = async (r: SpreadsheetRecord) => {
    if (!window.confirm(t('sheet.purge') + ` — ${r.title}?`)) return
    try {
      await invoke('spreadsheets:purge', { id: r.id })
      await reload()
    } catch (e) {
      notify.error(e)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border bg-surface px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{t('sheet.title')}</h1>
            <p className="text-xs text-muted">{t('sheet.studio')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" icon={<FolderOpen className="h-4 w-4" />} onClick={() => void pickAndOpenSpreadsheet()}>{t('sheet.open')}</Button>
            <Button size="sm" variant="primary" icon={<Plus className="h-4 w-4" />} onClick={newSheet}>{t('sheet.new')}</Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('common.search')} className="ps-9" />
          </div>
          <Button size="sm" variant={showTrash ? 'secondary' : 'ghost'} icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setShowTrash((v) => !v)}>{showTrash ? t('sheet.hideTrash') : t('sheet.showTrash')}</Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        {!loading && rows.length === 0 ? (
          <div className="card">
            <EmptyState icon={<Table2 className="h-6 w-6" />} title={t('sheet.emptyTitle')} body={t('sheet.emptyDesc')}
              action={<div className="flex gap-2"><Button variant="primary" onClick={newSheet}>{t('sheet.new')}</Button><Button variant="outline" onClick={() => void pickAndOpenSpreadsheet()}>{t('sheet.open')}</Button></div>} />
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2/60 text-[11.5px] text-muted">
                <tr>
                  <th className="px-4 py-2 text-start font-medium">{t('sheet.listCols.title')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('sheet.listCols.sheets')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('sheet.listCols.updated')}</th>
                  <th className="w-28 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id} className={clsx('group cursor-pointer hover:bg-surface-2/40', r.deletedAt && 'opacity-60')} onDoubleClick={() => !r.deletedAt && openRecord(r)}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4 shrink-0 text-success" />
                        <div>
                          <div className="font-medium">{r.title}</div>
                          {r.path && <div className="ltr-text truncate text-[11px] text-muted" dir="ltr">{r.path}</div>}
                        </div>
                        {r.deletedAt && <Badge tone="danger">{t('sheet.deleted')}</Badge>}
                        {r.isDemo && <Badge>{t('common.demo')}</Badge>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 ltr-text">{r.sheetCount}</td>
                    <td className="px-3 py-2.5 text-muted">{fmtDate(r.updatedAt, true)}</td>
                    <td className="px-2 py-2.5">
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100">
                        {r.deletedAt ? (
                          <>
                            <Button size="icon" variant="ghost" className="h-7 w-7" title={t('sheet.restore')} onClick={() => void restore(r)}><RotateCcw className="h-3.5 w-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-danger" title={t('sheet.purge')} onClick={() => void purge(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => openRecord(r)}>{t('common.open')}</Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-danger" title={t('sheet.trash')} onClick={() => void remove(r)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </>
                        )}
                      </div>
                    </td>
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
