/** تبويب الفواتير: قائمة مع بحث وتصفية وترتيب، إجراءات سريعة، وسلة محذوفات قابلة للاسترجاع. */
import { clsx } from 'clsx'
import { Copy, FilePlus2, MoreHorizontal, Receipt, RotateCcw, Search, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DocType, InvoiceFilters, InvoiceListRow, InvoiceStatus } from '@shared/invoicing'
import { DOC_TYPES, INVOICE_STATUSES } from '@shared/invoicing'
import type { TabComponentProps } from '@renderer/app/tabRegistry'
import { Badge, Button, EmptyState, Input, Select } from '@renderer/components/ui'
import { fmtDate, fmtMoney } from '@renderer/lib/format'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'
import { useSettings } from '@renderer/stores/settings'
import { useTabs } from '@renderer/stores/tabs'
import { statusTone } from './InvoiceEditor'

export function InvoicesTab({ tab }: TabComponentProps) {
  const { t } = useTranslation()
  const open = useTabs((s) => s.open)
  const confirmDelete = useSettings((s) => s.settings.general.confirmBeforeDelete)
  const [rows, setRows] = useState<InvoiceListRow[]>([])
  const [total, setTotal] = useState(0)
  const [filters, setFilters] = useState<InvoiceFilters>({ status: (tab.params.status as InvoiceFilters['status']) ?? 'all', docType: 'all', sort: 'date_desc', limit: 200 })
  const [trash, setTrash] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; row: InvoiceListRow } | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      const res = await invoke('invoices:list', { ...filters, onlyDeleted: trash })
      setRows(res.rows)
      setTotal(res.total)
    } catch (e) {
      notify.error(e)
    } finally {
      setLoading(false)
    }
  }, [filters, trash])

  useEffect(() => {
    void reload()
  }, [reload])
  useEffect(() => {
    const onFocus = () => void reload()
    window.addEventListener('focus', onFocus)
    const unsub = useTabs.subscribe((s, prev) => {
      if (s.activeId === tab.id && prev.activeId !== tab.id) void reload()
    })
    return () => {
      window.removeEventListener('focus', onFocus)
      unsub()
    }
  }, [reload, tab.id])
  useEffect(() => {
    if (!menu) return
    const hide = () => setMenu(null)
    window.addEventListener('click', hide)
    return () => window.removeEventListener('click', hide)
  }, [menu])

  const openInvoice = (row: InvoiceListRow) => open({ id: `invoice-${row.id}`, kind: 'invoice', title: row.number, params: { id: row.id } })
  const newDoc = (docType: DocType = 'invoice') => open({ kind: 'invoice', title: `t:inv.types.${docType}`, params: { id: null, docType } })

  const act = async (row: InvoiceListRow, action: 'trash' | 'restore' | 'purge' | 'duplicate' | 'sent' | 'paid' | 'cancelled') => {
    setMenu(null)
    try {
      if (action === 'trash') {
        if (confirmDelete && !window.confirm(t('inv.confirmTrash', { number: row.number }))) return
        await invoke('invoices:trash', { id: row.id })
        notify.success('inv.trashed')
      } else if (action === 'restore') {
        await invoke('invoices:restore', { id: row.id })
        notify.success('inv.restored')
      } else if (action === 'purge') {
        if (!window.confirm(t('inv.confirmPurge', { number: row.number }))) return
        await invoke('invoices:purge', { id: row.id })
        notify.success('inv.purged')
      } else if (action === 'duplicate') {
        const copy = await invoke('invoices:duplicate', { id: row.id })
        notify.success('inv.duplicated')
        open({ id: `invoice-${copy.id}`, kind: 'invoice', title: copy.number, params: { id: copy.id } })
      } else {
        await invoke('invoices:set-status', { id: row.id, status: action as InvoiceStatus })
      }
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
            <h1 className="text-lg font-semibold tracking-tight">{trash ? t('inv.trash') : t('inv.title')}</h1>
            <p className="text-xs text-muted">{t('inv.subtitle')}</p>
          </div>
          <div className="flex gap-2">
            <Button variant={trash ? 'outline' : 'ghost'} size="sm" icon={trash ? <X className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />} onClick={() => setTrash((v) => !v)}>{trash ? t('inv.backToList') : t('inv.trash')}</Button>
            <Button variant="outline" size="sm" onClick={() => newDoc('quote')}>{t('inv.newQuote')}</Button>
            <Button variant="primary" size="sm" icon={<FilePlus2 className="h-4 w-4" />} onClick={() => newDoc('invoice')}>{t('inv.new')}</Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={filters.query ?? ''} onChange={(e) => setFilters({ ...filters, query: e.target.value })} placeholder={t('inv.search')} className="ps-9" />
          </div>
          <Select value={filters.status ?? 'all'} onChange={(e) => setFilters({ ...filters, status: e.target.value as InvoiceFilters['status'] })} className="w-40">
            <option value="all">{t('inv.filters.all')}</option>
            <option value="unpaid">{t('inv.filters.unpaid')}</option>
            {INVOICE_STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
          </Select>
          <Select value={filters.docType ?? 'all'} onChange={(e) => setFilters({ ...filters, docType: e.target.value as InvoiceFilters['docType'] })} className="w-40">
            <option value="all">{t('inv.filters.all')}</option>
            {DOC_TYPES.map((d) => <option key={d} value={d}>{t(`inv.types.${d}`)}</option>)}
          </Select>
          <Input type="date" value={filters.from ?? ''} onChange={(e) => setFilters({ ...filters, from: e.target.value || undefined })} className="w-40 ltr-text" title={t('inv.filters.from')} />
          <Input type="date" value={filters.to ?? ''} onChange={(e) => setFilters({ ...filters, to: e.target.value || undefined })} className="w-40 ltr-text" title={t('inv.filters.to')} />
          <Select value={filters.sort ?? 'date_desc'} onChange={(e) => setFilters({ ...filters, sort: e.target.value as InvoiceFilters['sort'] })} className="w-40">
            {(['date_desc', 'date_asc', 'number', 'amount_desc', 'customer'] as const).map((s) => <option key={s} value={s}>{t(`inv.sort.${s}`)}</option>)}
          </Select>
          <span className="text-xs text-muted">{t('inv.total', { total })}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        {!loading && rows.length === 0 ? (
          <div className="card">
            <EmptyState icon={<Receipt className="h-6 w-6" />} title={t('empty.invoices.title')} body={t('empty.invoices.body')} action={!trash ? <Button variant="primary" onClick={() => newDoc()}>{t('empty.invoices.action')}</Button> : undefined} />
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2/60 text-[11.5px] text-muted">
                <tr>
                  <th className="px-4 py-2 text-start font-medium">{t('inv.cols.number')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('inv.cols.customer')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('inv.cols.date')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('inv.cols.due')}</th>
                  <th className="px-3 py-2 text-end font-medium">{t('inv.cols.total')}</th>
                  <th className="px-3 py-2 text-end font-medium">{t('inv.cols.paid')}</th>
                  <th className="px-3 py-2 text-end font-medium">{t('inv.cols.remaining')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('inv.cols.status')}</th>
                  <th className="w-10 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id} className="group cursor-default hover:bg-surface-2/40" onDoubleClick={() => !trash && openInvoice(r)} onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, row: r }) }}>
                    <td className="px-4 py-2.5">
                      <button type="button" className="font-medium ltr-text hover:text-accent" onClick={() => !trash && openInvoice(r)}>{r.number}</button>
                      {r.docType !== 'invoice' && <Badge className="ms-2">{t(`inv.types.${r.docType}`)}</Badge>}
                      {r.isDemo && <Badge tone="warning" className="ms-2">demo</Badge>}
                    </td>
                    <td className="px-3 py-2.5">{r.customerName || '—'}</td>
                    <td className="px-3 py-2.5 ltr-text">{fmtDate(r.issueDate)}</td>
                    <td className={clsx('px-3 py-2.5 ltr-text', r.status === 'overdue' && 'text-danger')}>{fmtDate(r.dueDate)}</td>
                    <td className="px-3 py-2.5 text-end font-medium ltr-text">{fmtMoney(r.grandTotalMinor, r.currency)}</td>
                    <td className="px-3 py-2.5 text-end text-muted ltr-text">{fmtMoney(r.paidMinor, r.currency)}</td>
                    <td className={clsx('px-3 py-2.5 text-end ltr-text', r.remainingMinor > 0 && r.status !== 'cancelled' ? 'text-warning font-medium' : 'text-muted')}>{fmtMoney(r.remainingMinor, r.currency)}</td>
                    <td className="px-3 py-2.5"><Badge tone={statusTone(r.status)}>{t(`status.${r.status}`)}</Badge></td>
                    <td className="px-2 py-2.5 text-end">
                      <button type="button" className="rounded p-1 text-muted opacity-0 hover:bg-surface-2 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, row: r }) }}><MoreHorizontal className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {menu && (
        <ul className="card fixed z-50 min-w-[210px] py-1 text-[13px] shadow-pop animate-scale-in" style={{ top: Math.min(menu.y, window.innerHeight - 260), left: Math.min(menu.x, window.innerWidth - 230) }} onClick={(e) => e.stopPropagation()}>
          {trash ? (
            <>
              <MenuItem icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => void act(menu.row, 'restore')}>{t('inv.actions.restore')}</MenuItem>
              <MenuItem icon={<Trash2 className="h-3.5 w-3.5" />} danger onClick={() => void act(menu.row, 'purge')}>{t('inv.actions.purge')}</MenuItem>
            </>
          ) : (
            <>
              <MenuItem onClick={() => { setMenu(null); openInvoice(menu.row) }}>{t('inv.actions.open')}</MenuItem>
              <MenuItem icon={<Copy className="h-3.5 w-3.5" />} onClick={() => void act(menu.row, 'duplicate')}>{t('inv.actions.duplicate')}</MenuItem>
              {menu.row.status === 'draft' && <MenuItem onClick={() => void act(menu.row, 'sent')}>{t('inv.actions.markSent')}</MenuItem>}
              {menu.row.status !== 'cancelled' && menu.row.status !== 'paid' && <MenuItem onClick={() => void act(menu.row, 'cancelled')}>{t('inv.actions.cancel')}</MenuItem>}
              <MenuItem icon={<Trash2 className="h-3.5 w-3.5" />} danger onClick={() => void act(menu.row, 'trash')}>{t('inv.actions.trash')}</MenuItem>
            </>
          )}
        </ul>
      )}
    </div>
  )
}

function MenuItem({ children, onClick, icon, danger }: { children: React.ReactNode; onClick: () => void; icon?: React.ReactNode; danger?: boolean }) {
  return (
    <li>
      <button type="button" onClick={onClick} className={clsx('flex w-full items-center gap-2 px-3 py-1.5 text-start hover:bg-surface-2', danger && 'text-danger')}>{icon}{children}</button>
    </li>
  )
}
