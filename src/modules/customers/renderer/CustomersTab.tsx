/** تبويب العملاء: جدول مع بحث وترتيب، إجمالي الفواتير والمدفوع والمتبقي، إنشاء/تعديل/حذف، وفتح ملف العميل. */
import { clsx } from 'clsx'
import { Pencil, Search, Trash2, UserPlus, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Customer, CustomerSummary } from '@shared/invoicing'
import { customerDisplayName } from '@shared/invoicing'
import type { TabComponentProps } from '@renderer/app/tabRegistry'
import { Button, EmptyState, Input, Select } from '@renderer/components/ui'
import { fmtMoney } from '@renderer/lib/format'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'
import { useSettings } from '@renderer/stores/settings'
import { useTabs } from '@renderer/stores/tabs'
import { CustomerDialog } from './CustomerDialog'

type Sort = 'name' | 'recent' | 'invoiced_desc' | 'remaining_desc'

export function CustomersTab({ tab }: TabComponentProps) {
  const { t } = useTranslation()
  const open = useTabs((s) => s.open)
  const confirmDelete = useSettings((s) => s.settings.general.confirmBeforeDelete)
  const currency = useSettings((s) => s.settings.invoice.defaultCurrency)
  const [rows, setRows] = useState<CustomerSummary[]>([])
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('name')
  const [dialog, setDialog] = useState<{ open: boolean; customer: Customer | null }>({ open: false, customer: null })
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      setRows(await invoke('customers:list', { query, sort, limit: 500 }))
    } catch (e) {
      notify.error(e)
    } finally {
      setLoading(false)
    }
  }, [query, sort])

  useEffect(() => {
    const h = setTimeout(() => void reload(), 120)
    return () => clearTimeout(h)
  }, [reload])
  useEffect(() => {
    const unsub = useTabs.subscribe((s, prev) => {
      if (s.activeId === tab.id && prev.activeId !== tab.id) void reload()
    })
    return unsub
  }, [reload, tab.id])

  const openProfile = (c: Customer) => open({ id: `customer-${c.id}`, kind: 'customer', title: customerDisplayName(c), params: { id: c.id } })
  const remove = async (c: Customer) => {
    if (confirmDelete && !window.confirm(t('cust.confirmDelete', { name: customerDisplayName(c) }))) return
    try {
      await invoke('customers:delete', { id: c.id })
      notify.success('cust.deleted')
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
            <h1 className="text-lg font-semibold tracking-tight">{t('cust.title')}</h1>
            <p className="text-xs text-muted">{t('cust.subtitle')}</p>
          </div>
          <Button variant="primary" size="sm" icon={<UserPlus className="h-4 w-4" />} onClick={() => setDialog({ open: true, customer: null })}>{t('cust.new')}</Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('cust.search')} className="ps-9" />
          </div>
          <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="w-44">
            {(['name', 'recent', 'invoiced_desc', 'remaining_desc'] as Sort[]).map((s) => <option key={s} value={s}>{t(`cust.sort.${s}`)}</option>)}
          </Select>
          <span className="text-xs text-muted">{t('cust.count', { count: rows.length })}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        {!loading && rows.length === 0 ? (
          <div className="card"><EmptyState icon={<Users className="h-6 w-6" />} title={t('empty.customers.title')} body={t('empty.customers.body')} action={<Button variant="primary" onClick={() => setDialog({ open: true, customer: null })}>{t('empty.customers.action')}</Button>} /></div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-surface-2/60 text-[11.5px] text-muted">
                <tr>
                  <th className="px-4 py-2 text-start font-medium">{t('cust.cols.name')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('cust.cols.phone')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('cust.cols.email')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('cust.cols.city')}</th>
                  <th className="px-3 py-2 text-end font-medium">{t('cust.cols.invoices')}</th>
                  <th className="px-3 py-2 text-end font-medium">{t('cust.cols.invoiced')}</th>
                  <th className="px-3 py-2 text-end font-medium">{t('cust.cols.paid')}</th>
                  <th className="px-3 py-2 text-end font-medium">{t('cust.cols.remaining')}</th>
                  <th className="w-20 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((c) => (
                  <tr key={c.id} className="group hover:bg-surface-2/40" onDoubleClick={() => openProfile(c)}>
                    <td className="px-4 py-2.5">
                      <button type="button" className="font-medium hover:text-accent" onClick={() => openProfile(c)}>{customerDisplayName(c)}</button>
                      {c.customerNumber && <div className="text-[11px] text-muted ltr-text">{c.customerNumber}</div>}
                    </td>
                    <td className="px-3 py-2.5 ltr-text whitespace-nowrap">{c.phone}</td>
                    <td className="px-3 py-2.5 ltr-text text-muted">{c.email}</td>
                    <td className="px-3 py-2.5">{c.city}</td>
                    <td className="px-3 py-2.5 text-end ltr-text whitespace-nowrap">{c.invoicesCount}</td>
                    <td className="px-3 py-2.5 text-end ltr-text whitespace-nowrap">{fmtMoney(c.totalInvoicedMinor, currency)}</td>
                    <td className="px-3 py-2.5 text-end text-success ltr-text">{fmtMoney(c.paidMinor, currency)}</td>
                    <td className={clsx('px-3 py-2.5 text-end ltr-text whitespace-nowrap', c.remainingMinor > 0 ? 'font-medium text-warning' : 'text-muted')}>{fmtMoney(c.remainingMinor, currency)}</td>
                    <td className="px-2 py-2.5">
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100">
                        <Button size="icon" variant="ghost" className="h-7 w-7" title={t('common.edit')} onClick={() => setDialog({ open: true, customer: c })}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-danger" title={t('common.delete')} onClick={() => void remove(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <CustomerDialog open={dialog.open} customer={dialog.customer} onClose={() => setDialog({ open: false, customer: null })} onSaved={() => { setDialog({ open: false, customer: null }); void reload() }} />
    </div>
  )
}
