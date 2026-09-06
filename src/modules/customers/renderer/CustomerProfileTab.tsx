/** ملف العميل: بياناته، إحصاءاته المالية، فواتيره، مدفوعاته، ملاحظاته، وإنشاء فاتورة له مباشرة. */
import { clsx } from 'clsx'
import { FilePlus2, Pencil, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CustomerSummary, InvoiceListRow } from '@shared/invoicing'
import { customerDisplayName } from '@shared/invoicing'
import type { TabComponentProps } from '@renderer/app/tabRegistry'
import { ExtrasPanel } from '@modules/extras/renderer/ExtrasPanel'
import { Badge, Button, Card, EmptyState, Spinner } from '@renderer/components/ui'
import { fmtDate, fmtMoney } from '@renderer/lib/format'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'
import { useSettings } from '@renderer/stores/settings'
import { useTabs } from '@renderer/stores/tabs'
import { statusTone } from '@modules/invoices/renderer/InvoiceEditor'
import { CustomerDialog } from './CustomerDialog'

export function CustomerProfileTab({ tab }: TabComponentProps) {
  const { t } = useTranslation()
  const id = tab.params.id as number
  const { open, setTitle } = useTabs()
  const currency = useSettings((s) => s.settings.invoice.defaultCurrency)
  const [customer, setCustomer] = useState<CustomerSummary | null>(null)
  const [invoices, setInvoices] = useState<InvoiceListRow[]>([])
  const [edit, setEdit] = useState(false)

  const reload = useCallback(async () => {
    try {
      const [c, list] = await Promise.all([invoke('customers:get', { id }), invoke('invoices:list', { customerId: id, limit: 200 })])
      setCustomer(c)
      setInvoices(list.rows)
      if (c) setTitle(tab.id, customerDisplayName(c))
    } catch (e) {
      notify.error(e)
    }
  }, [id, tab.id, setTitle])

  useEffect(() => {
    void reload()
    const unsub = useTabs.subscribe((s, prev) => {
      if (s.activeId === tab.id && prev.activeId !== tab.id) void reload()
    })
    return unsub
  }, [reload, tab.id])

  if (!customer) return <div className="flex h-full items-center justify-center"><Spinner /></div>

  const payments = invoices.filter((i) => i.paidMinor > 0)
  const details: [string, string][] = [
    [t('cust.fields.customerNumber'), customer.customerNumber ?? ''], [t('cust.fields.phone'), customer.phone], [t('cust.fields.email'), customer.email],
    [t('cust.fields.address'), [customer.address, customer.city, customer.country].filter(Boolean).join(', ')], [t('cust.fields.taxId'), customer.taxId]
  ]

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-4 p-6 animate-fade-in">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent"><Users className="h-6 w-6" /></div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{customerDisplayName(customer)}</h1>
              <p className="text-xs text-muted">{t('cust.profile.lastActivity')}: {customer.lastActivityAt ? fmtDate(customer.lastActivityAt, true) : '—'}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEdit(true)}>{t('common.edit')}</Button>
            <Button variant="primary" size="sm" icon={<FilePlus2 className="h-4 w-4" />} onClick={() => open({ kind: 'invoice', title: 't:inv.new', params: { id: null, customerId: customer.id } })}>{t('cust.profile.newInvoice')}</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={t('cust.cols.invoices')} value={String(customer.invoicesCount)} />
          <Stat label={t('cust.cols.invoiced')} value={fmtMoney(customer.totalInvoicedMinor, currency)} />
          <Stat label={t('cust.cols.paid')} value={fmtMoney(customer.paidMinor, currency)} tone="success" />
          <Stat label={t('cust.profile.remaining')} value={fmtMoney(customer.remainingMinor, currency)} tone={customer.remainingMinor > 0 ? 'warning' : undefined} />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card title={t('cust.profile.info')}>
            <dl className="space-y-2 text-[13px]">
              {details.filter(([, v]) => v).map(([k, v]) => (
                <div key={k}><dt className="text-[11px] text-muted">{k}</dt><dd className="ltr-text">{v}</dd></div>
              ))}
            </dl>
            {customer.notes && <div className="mt-3 border-t border-border pt-3"><div className="text-[11px] text-muted">{t('cust.profile.notes')}</div><p className="whitespace-pre-wrap text-[13px]">{customer.notes}</p></div>}
            <ExtrasPanel ownerType="customer" ownerId={customer.id} />
          </Card>

          <Card title={t('cust.profile.invoices')} className="lg:col-span-2">
            {invoices.length === 0 ? <EmptyState title={t('cust.profile.noInvoices')} /> : (
              <table className="w-full text-[13px]">
                <thead className="text-[11.5px] text-muted"><tr><th className="py-1 pe-3 text-start font-medium">{t('inv.cols.number')}</th><th className="px-2 py-1 text-start font-medium">{t('inv.cols.date')}</th><th className="px-2 py-1 text-end font-medium">{t('inv.cols.total')}</th><th className="px-2 py-1 text-end font-medium">{t('inv.cols.paid')}</th><th className="px-2 py-1 text-end font-medium">{t('inv.cols.remaining')}</th><th className="ps-3 py-1 text-start font-medium">{t('inv.cols.status')}</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {invoices.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-2/40">
                      <td className="py-2 pe-3"><button type="button" className="font-medium ltr-text hover:text-accent" onClick={() => open({ id: `invoice-${r.id}`, kind: 'invoice', title: r.number, params: { id: r.id } })}>{r.number}</button></td>
                      <td className="px-2 py-2 ltr-text whitespace-nowrap">{fmtDate(r.issueDate)}</td>
                      <td className="px-2 py-2 text-end ltr-text whitespace-nowrap">{fmtMoney(r.grandTotalMinor, r.currency)}</td>
                      <td className="px-2 py-2 text-end text-muted ltr-text whitespace-nowrap">{fmtMoney(r.paidMinor, r.currency)}</td>
                      <td className={clsx('px-2 py-2 text-end ltr-text whitespace-nowrap', r.remainingMinor > 0 && r.status !== 'cancelled' ? 'text-warning' : 'text-muted')}>{r.status === 'cancelled' ? '—' : fmtMoney(r.remainingMinor, r.currency)}</td>
                      <td className="ps-3 py-2"><Badge tone={statusTone(r.status)}>{t(`status.${r.status}`)}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <Card title={t('cust.profile.payments')}>
          {payments.length === 0 ? <p className="text-xs text-muted">{t('inv.editor.noPayments')}</p> : (
            <ul className="divide-y divide-border text-[13px]">
              {payments.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2">
                  <span className="ltr-text">{r.number}</span>
                  <span className="text-muted ltr-text">{fmtDate(r.updatedAt)}</span>
                  <span className="font-medium text-success ltr-text">{fmtMoney(r.paidMinor, r.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <CustomerDialog open={edit} customer={customer} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); void reload() }} />
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'warning' }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={clsx('mt-1 text-lg font-semibold ltr-text', tone === 'success' && 'text-success', tone === 'warning' && 'text-warning')}>{value}</div>
    </div>
  )
}
