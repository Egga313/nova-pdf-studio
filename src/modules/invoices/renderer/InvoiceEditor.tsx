/**
 * تبويب الفاتورة: الأعلى (حفظ/طباعة/تصدير/معاينة/قالب/المزيد)، الوسط نموذج الفاتورة والبنود، اليمين لوحة الخصائص والمجاميع.
 * كل الأرقام تُحسب فورًا عبر المحرّك المركزي، والحفظ يعيد الحساب في العملية الرئيسية ويعيد الفاتورة المخزّنة.
 */
import { clsx } from 'clsx'
import { Ban, Check, CreditCard, FileDown, Printer, Save, Search, Send, Trash2, UserPlus, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { StoreApi } from 'zustand'
import type { Customer, CustomerSnapshot, DocType, Invoice, InvoiceStatus, PaymentMethod } from '@shared/invoicing'
import { customerDisplayName, DOC_TYPES, PAYMENT_METHODS } from '@shared/invoicing'
import { minorToDecimalString, parseMinor } from '@shared/money'
import type { TabComponentProps } from '@renderer/app/tabRegistry'
import { Badge, Button, Dialog, Field, Input, Select, Spinner, Switch, Textarea } from '@renderer/components/ui'
import { fmtDate, fmtMoney } from '@renderer/lib/format'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'
import { currentCurrency, useSettings } from '@renderer/stores/settings'
import { useTabs } from '@renderer/stores/tabs'
import { CustomerDialog } from '@modules/customers/renderer/CustomerDialog'
import { amountInWords } from '../shared/amountInWords'
import { ItemsGrid, emptyLike } from './ItemsGrid'
import { createDraftStore, type DraftHeader, type DraftState, useDraft } from './useInvoiceDraft'

const todayIso = () => new Date().toISOString().slice(0, 10)
const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function InvoiceEditor({ tab }: TabComponentProps) {
  const { t } = useTranslation()
  const settings = useSettings((s) => s.settings)
  const taxes = useSettings((s) => s.taxes)
  const currencies = useSettings((s) => s.currencies)
  const { setDirty, setTitle, open: openTab, close: closeTab } = useTabs()
  const invoiceId = (tab.params.id as number | null | undefined) ?? null
  const presetCustomerId = tab.params.customerId as number | undefined
  const presetDocType = (tab.params.docType as DocType | undefined) ?? 'invoice'

  const defaultTax = useMemo(() => {
    const tx = taxes.find((x) => x.id === settings.invoice.defaultTaxId) ?? taxes.find((x) => x.isDefault)
    return { taxBps: tx?.rateBps ?? 0, taxName: tx?.name ?? '' }
  }, [taxes, settings.invoice.defaultTaxId])

  const storeRef = useRef<StoreApi<DraftState> | null>(null)
  if (!storeRef.current) {
    const header: DraftHeader = {
      id: null, docType: presetDocType, number: null, status: 'draft', customerId: presetCustomerId ?? null, customerSnapshot: null,
      issueDate: todayIso(), dueDate: addDays(todayIso(), settings.invoice.defaultDueDays), reference: '', purchaseOrder: '',
      currency: settings.invoice.defaultCurrency, currencyPosition: settings.invoice.currencyPosition, paymentMethod: '', notes: settings.invoice.defaultNotes,
      paymentTerms: settings.invoice.defaultPaymentTerms, templateId: null, shippingMinor: 0, feesMinor: 0, amountInWords: settings.invoice.amountInWords,
      source: 'manual', sourceDocumentId: null
    }
    storeRef.current = createDraftStore(header, [{ ...emptyLike(defaultTax), key: 'row-0' } as never])
  }
  const store = storeRef.current
  const header = useDraft(store, (s) => s.header)
  const totals = useDraft(store, (s) => s.totals)
  const payments = useDraft(store, (s) => s.payments)
  const dirty = useDraft(store, (s) => s.dirty)
  const [loading, setLoading] = useState(!!invoiceId)
  const [saving, setSaving] = useState(false)
  const [nextNumber, setNextNumber] = useState('')
  const [customerDialog, setCustomerDialog] = useState(false)
  const [payDialog, setPayDialog] = useState(false)

  // تحميل فاتورة موجودة أو عميل مسبق
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (invoiceId) {
          const inv = await invoke('invoices:get', { id: invoiceId })
          if (inv && !cancelled) {
            store.getState().loadInvoice(inv)
            setTitle(tab.id, inv.number)
          }
        } else if (presetCustomerId) {
          const c = await invoke('customers:get', { id: presetCustomerId })
          if (c && !cancelled) store.getState().setHeader({ customerId: c.id, customerSnapshot: toSnapshot(c) })
        }
        if (!invoiceId) setNextNumber(await invoke('invoices:next-number', { docType: presetDocType }))
      } catch (e) {
        notify.error(e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId])

  useEffect(() => setDirty(tab.id, dirty), [dirty, tab.id, setDirty])

  const save = useCallback(async (close = false): Promise<Invoice | null> => {
    const input = store.getState().toInput()
    if (!input.items.length) {
      notify.warning('inv.editor.validation.noItems')
      return null
    }
    if (!input.customerId && !input.customerSnapshot?.displayName) {
      notify.warning('inv.editor.validation.noCustomer')
      return null
    }
    setSaving(true)
    try {
      const saved = await invoke('invoices:save', input)
      store.getState().loadInvoice(saved)
      setTitle(tab.id, saved.number)
      notify.success('inv.saved', { number: saved.number })
      if (close) closeTab(tab.id)
      return saved
    } catch (e) {
      notify.error(e)
      return null
    } finally {
      setSaving(false)
    }
  }, [store, tab.id, setTitle, closeTab])

  // Ctrl+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useTabs.getState().activeId !== tab.id) return
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [save, tab.id])

  const setStatus = async (status: InvoiceStatus) => {
    const saved = header.id ? await invoke('invoices:set-status', { id: header.id, status }).catch((e) => (notify.error(e), null)) : (store.getState().setHeader({ status }), await save())
    if (saved) store.getState().loadInvoice(saved)
  }

  const currency = currentCurrency(header.currency)
  const words = header.amountInWords ? safeWords(totals.grandTotalMinor, header.currency, settings.language, currency.decimals) : ''

  if (loading) return <div className="flex h-full items-center justify-center"><Spinner /></div>

  return (
    <div className="flex h-full flex-col">
      {/* شريط الإجراءات */}
      <div className="flex h-12 items-center gap-2 border-b border-border bg-surface px-3">
        <Badge tone={statusTone(header.status)}>{t(`status.${header.status}`)}</Badge>
        <span className="text-[13px] font-semibold ltr-text">{header.number ?? `${t('inv.editor.autoNumber')} · ${nextNumber}`}</span>
        {dirty && <span className="text-[11px] text-warning">• {t('inv.editor.unsaved')}</span>}
        <div className="ms-auto flex items-center gap-1">
          <Button size="sm" variant="primary" icon={<Save className="h-3.5 w-3.5" />} loading={saving} onClick={() => void save()}>{t('common.save')}</Button>
          <Button size="sm" variant="ghost" onClick={() => void save(true)} disabled={saving}>{t('inv.editor.saveAndClose')}</Button>
          <span className="mx-1 h-5 w-px bg-border" />
          <Button size="sm" variant="ghost" icon={<Printer className="h-3.5 w-3.5" />} disabled={!header.id} onClick={() => header.id && openTab({ kind: 'invoice-preview', title: header.number ?? '', params: { id: header.id, action: 'print' } })}>{t('inv.editor.print')}</Button>
          <Button size="sm" variant="ghost" icon={<FileDown className="h-3.5 w-3.5" />} disabled={!header.id} onClick={() => header.id && openTab({ kind: 'invoice-preview', title: header.number ?? '', params: { id: header.id, action: 'export' } })}>{t('inv.editor.exportPdf')}</Button>
          <Button size="sm" variant="ghost" icon={<Search className="h-3.5 w-3.5" />} disabled={!header.id} onClick={() => header.id && openTab({ kind: 'invoice-preview', title: header.number ?? '', params: { id: header.id } })}>{t('inv.editor.preview')}</Button>
          <span className="mx-1 h-5 w-px bg-border" />
          <Button size="sm" variant="ghost" icon={<CreditCard className="h-3.5 w-3.5" />} disabled={!header.id || header.status === 'cancelled'} onClick={() => setPayDialog(true)}>{t('inv.actions.addPayment')}</Button>
          {header.status === 'draft' && <Button size="sm" variant="ghost" icon={<Send className="h-3.5 w-3.5" />} onClick={() => void setStatus('sent')}>{t('inv.actions.markSent')}</Button>}
          {header.id && header.status !== 'cancelled' && header.status !== 'paid' && <Button size="sm" variant="ghost" icon={<Ban className="h-3.5 w-3.5" />} onClick={() => void setStatus('cancelled')}>{t('inv.actions.cancel')}</Button>}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* المحتوى */}
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl space-y-4 p-5 animate-fade-in">
            <div className="grid gap-4 md:grid-cols-2">
              <CompanyCard />
              <CustomerCard store={store} onNew={() => setCustomerDialog(true)} />
            </div>
            <InfoCard store={store} taxesReady={taxes.length > 0} currencies={currencies.map((c) => c.code)} />
            <section>
              <h3 className="mb-2 text-[13px] font-semibold">{t('inv.editor.items')}</h3>
              <ItemsGrid store={store} taxes={taxes} currency={header.currency} defaultTax={defaultTax} readOnly={header.status === 'cancelled'} />
            </section>
            <div className="grid gap-4 md:grid-cols-2">
              <section className="card p-4">
                <h3 className="mb-2 text-[13px] font-semibold">{t('inv.editor.notes')}</h3>
                <Textarea value={header.notes} onChange={(e) => store.getState().setHeader({ notes: e.target.value })} placeholder={t('inv.editor.notesPlaceholder')} />
                <Field label={t('inv.editor.terms')} className="mt-3"><Textarea value={header.paymentTerms} onChange={(e) => store.getState().setHeader({ paymentTerms: e.target.value })} placeholder={t('inv.editor.termsPlaceholder')} className="min-h-[56px]" /></Field>
              </section>
              <PaymentsCard payments={payments} currency={header.currency} canEdit={!!header.id} onDelete={async (id) => { try { store.getState().loadInvoice(await invoke('payments:delete', { id })) } catch (e) { notify.error(e) } }} />
            </div>
          </div>
        </div>

        {/* لوحة المجاميع */}
        <aside className="w-72 shrink-0 overflow-y-auto border-s border-border bg-surface p-4 text-[13px]">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{t('inv.editor.totals')}</h3>
          <Row label={t('inv.editor.subtotal')} value={fmtMoney(totals.subtotalMinor, header.currency)} />
          {totals.discountTotalMinor > 0 && <Row label={t('inv.editor.discountTotal')} value={`− ${fmtMoney(totals.discountTotalMinor, header.currency)}`} />}
          <Row label={t('inv.editor.taxable')} value={fmtMoney(totals.taxableMinor, header.currency)} />
          {totals.taxBreakdown.filter((b) => b.taxBps > 0).map((b) => (
            <Row key={b.taxBps} label={`${t('inv.editor.grid.tax')} ${b.taxBps / 100}%`} value={fmtMoney(b.taxMinor, header.currency)} muted />
          ))}
          <Row label={t('inv.editor.taxTotal')} value={fmtMoney(totals.taxTotalMinor, header.currency)} />
          <div className="my-2 grid grid-cols-2 gap-2">
            <Field label={t('inv.editor.shipping')}><MoneyInput value={header.shippingMinor} onChange={(v) => store.getState().setHeader({ shippingMinor: v })} /></Field>
            <Field label={t('inv.editor.fees')}><MoneyInput value={header.feesMinor} onChange={(v) => store.getState().setHeader({ feesMinor: v })} /></Field>
          </div>
          <Row label={t('inv.editor.beforeTax')} value={fmtMoney(totals.amountBeforeTaxMinor, header.currency)} />
          <div className="my-3 rounded-lg bg-accent/10 p-3">
            <div className="text-xs text-accent">{t('inv.editor.grandTotal')}</div>
            <div className="mt-0.5 text-xl font-semibold ltr-text text-accent">{fmtMoney(totals.grandTotalMinor, header.currency)}</div>
          </div>
          <Row label={t('inv.editor.amountPaid')} value={fmtMoney(totals.paidMinor, header.currency)} />
          <Row label={t('inv.editor.remaining')} value={fmtMoney(totals.remainingMinor, header.currency)} strong tone={totals.remainingMinor > 0 && totals.paidMinor > 0 ? 'warning' : undefined} />
          <div className="mt-3 border-t border-border pt-3">
            <Switch label={t('inv.editor.amountInWords')} checked={header.amountInWords} onChange={(v) => store.getState().setHeader({ amountInWords: v })} />
            {words && <p className="mt-1 rounded-md bg-surface-2/60 p-2 text-[12px] leading-relaxed">{words}</p>}
          </div>
        </aside>
      </div>

      <CustomerDialog open={customerDialog} onClose={() => setCustomerDialog(false)} onSaved={(c) => { store.getState().setHeader({ customerId: c.id, customerSnapshot: toSnapshot(c) }); setCustomerDialog(false) }} />
      {header.id && <PaymentDialog open={payDialog} onClose={() => setPayDialog(false)} invoiceId={header.id} remainingMinor={totals.remainingMinor} currency={header.currency} onSaved={(inv) => { store.getState().loadInvoice(inv); setPayDialog(false) }} />}
    </div>
  )
}

// ------------------------------------------------------------------ أجزاء
function CompanyCard() {
  const { t } = useTranslation()
  const c = useSettings((s) => s.settings.company)
  const visible = c.visibleFields
  const lines = [
    visible.name && c.name, visible.ownerName && [c.firstName, c.lastName].filter(Boolean).join(' '), visible.address && [c.address, c.city, c.country].filter(Boolean).join(', '),
    visible.phone && c.phone, visible.email && c.email, visible.website && c.website, visible.rc && c.rc && `RC: ${c.rc}`, visible.nif && c.nif && `NIF: ${c.nif}`,
    visible.nis && c.nis && `NIS: ${c.nis}`, visible.ai && c.ai && `AI: ${c.ai}`
  ].filter(Boolean) as string[]
  return (
    <section className="card p-4">
      <h3 className="mb-2 text-[13px] font-semibold">{t('inv.editor.company')}</h3>
      {lines.length === 0 ? <p className="text-xs text-muted">{t('settings.company.hint')}</p> : <ul className="space-y-0.5 text-[12.5px]">{lines.map((l, i) => <li key={i} className={clsx(i === 0 && 'font-semibold')}>{l}</li>)}</ul>}
    </section>
  )
}

function toSnapshot(c: Customer): CustomerSnapshot {
  return { id: c.id, displayName: customerDisplayName(c), firstName: c.firstName, lastName: c.lastName, companyName: c.companyName, address: c.address, city: c.city, country: c.country, phone: c.phone, email: c.email, taxId: c.taxId, customerNumber: c.customerNumber }
}

function CustomerCard({ store, onNew }: { store: StoreApi<DraftState>; onNew: () => void }) {
  const { t } = useTranslation()
  const header = useDraft(store, (s) => s.header)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Customer[]>([])
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const h = setTimeout(() => invoke('customers:search', { query, limit: 8 }).then(setResults).catch(() => setResults([])), 150)
    return () => clearTimeout(h)
  }, [query, open])
  const snap = header.customerSnapshot
  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold">{t('inv.editor.billTo')}</h3>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" icon={<UserPlus className="h-3.5 w-3.5" />} onClick={onNew}>{t('inv.editor.newCustomer')}</Button>
          {snap && <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={() => store.getState().setHeader({ customerId: null, customerSnapshot: null })}>{t('inv.editor.clearCustomer')}</Button>}
        </div>
      </div>
      {snap ? (
        <div className="text-[12.5px]">
          <div className="font-semibold">{snap.displayName}</div>
          {[snap.address, [snap.city, snap.country].filter(Boolean).join(', '), snap.phone, snap.email, snap.taxId && `${t('cust.fields.taxId')}: ${snap.taxId}`].filter(Boolean).map((l, i) => <div key={i} className="text-muted">{l}</div>)}
        </div>
      ) : (
        <div className="relative">
          <Input value={query} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => setQuery(e.target.value)} placeholder={t('inv.editor.customerSearch')} />
          {open && results.length > 0 && (
            <ul className="card absolute start-0 end-0 top-full z-20 mt-1 py-1 shadow-pop">
              {results.map((c) => (
                <li key={c.id}>
                  <button type="button" onMouseDown={() => store.getState().setHeader({ customerId: c.id, customerSnapshot: toSnapshot(c) })} className="flex w-full items-center justify-between px-3 py-1.5 text-start text-[12.5px] hover:bg-surface-2">
                    <span>{customerDisplayName(c)}</span><span className="text-[11px] text-muted ltr-text">{c.phone}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">{t('inv.editor.noCustomer')}</p>
        </div>
      )}
    </section>
  )
}

function InfoCard({ store, currencies }: { store: StoreApi<DraftState>; taxesReady: boolean; currencies: string[] }) {
  const { t } = useTranslation()
  const h = useDraft(store, (s) => s.header)
  const set = (patch: Partial<DraftHeader>) => store.getState().setHeader(patch)
  return (
    <section className="card grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
      <Field label={t('inv.editor.type')}>
        <Select value={h.docType} disabled={!!h.id} onChange={(e) => set({ docType: e.target.value as DocType })}>{DOC_TYPES.map((d) => <option key={d} value={d}>{t(`inv.types.${d}`)}</option>)}</Select>
      </Field>
      <Field label={t('inv.editor.number')}><Input value={h.number ?? ''} placeholder={t('inv.editor.autoNumber')} onChange={(e) => set({ number: e.target.value || null })} className="ltr-text" /></Field>
      <Field label={t('inv.editor.issueDate')}><Input type="date" value={h.issueDate} onChange={(e) => set({ issueDate: e.target.value })} className="ltr-text" /></Field>
      <Field label={t('inv.editor.dueDate')}><Input type="date" value={h.dueDate ?? ''} onChange={(e) => set({ dueDate: e.target.value || null })} className="ltr-text" /></Field>
      <Field label={t('inv.editor.reference')}><Input value={h.reference} onChange={(e) => set({ reference: e.target.value })} /></Field>
      <Field label={t('inv.editor.purchaseOrder')}><Input value={h.purchaseOrder} onChange={(e) => set({ purchaseOrder: e.target.value })} /></Field>
      <Field label={t('inv.editor.currency')}><Select value={h.currency} onChange={(e) => set({ currency: e.target.value })}>{currencies.map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
      <Field label={t('inv.editor.paymentMethod')}>
        <Select value={h.paymentMethod} onChange={(e) => set({ paymentMethod: e.target.value })}>
          <option value="">—</option>
          {PAYMENT_METHODS.map((m: PaymentMethod) => <option key={m} value={m}>{t(`inv.editor.methods.${m}`)}</option>)}
        </Select>
      </Field>
    </section>
  )
}

function PaymentsCard({ payments, currency, canEdit, onDelete }: { payments: Invoice['payments']; currency: string; canEdit: boolean; onDelete: (id: number) => void }) {
  const { t } = useTranslation()
  return (
    <section className="card p-4">
      <h3 className="mb-2 text-[13px] font-semibold">{t('inv.editor.payments')}</h3>
      {!canEdit ? <p className="text-xs text-muted">{t('inv.editor.saveFirst')}</p> : payments.length === 0 ? <p className="text-xs text-muted">{t('inv.editor.noPayments')}</p> : (
        <table className="w-full text-[12.5px]">
          <thead className="text-[11px] text-muted"><tr><th className="py-1 text-start font-medium">{t('inv.editor.payDate')}</th><th className="py-1 text-end font-medium">{t('inv.editor.payAmount')}</th><th className="py-1 text-start font-medium">{t('inv.editor.payMethod')}</th><th className="py-1 text-start font-medium">{t('inv.editor.payRef')}</th><th></th></tr></thead>
          <tbody className="divide-y divide-border">
            {payments.map((p) => (
              <tr key={p.id} className="group">
                <td className="py-1.5 ltr-text">{fmtDate(p.paidAt)}</td>
                <td className="py-1.5 text-end font-medium ltr-text">{fmtMoney(p.amountMinor, currency)}</td>
                <td className="py-1.5">{p.method ? t(`inv.editor.methods.${p.method}`, p.method) : ''}</td>
                <td className="py-1.5 text-muted ltr-text">{p.reference}</td>
                <td className="py-1.5 text-end"><button type="button" title={t('inv.editor.deletePayment')} onClick={() => onDelete(p.id)} className="text-muted opacity-0 hover:text-danger group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

export function PaymentDialog({ open, onClose, invoiceId, remainingMinor, currency, onSaved }: { open: boolean; onClose: () => void; invoiceId: number; remainingMinor: number; currency: string; onSaved: (inv: Invoice) => void }) {
  const { t } = useTranslation()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayIso())
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [ref, setRef] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) {
      setAmount(minorToDecimalString(Math.max(0, remainingMinor)))
      setDate(todayIso())
      setRef('')
      setNotes('')
    }
  }, [open, remainingMinor])
  const submit = async () => {
    setBusy(true)
    try {
      const inv = await invoke('payments:add', { invoiceId, paidAt: date, amountMinor: parseMinor(amount), method, reference: ref, notes })
      notify.success('toast.saved')
      onSaved(inv)
    } catch (e) {
      notify.error(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onClose={onClose} title={t('inv.editor.addPayment')} width="max-w-sm"
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" loading={busy} icon={<Check className="h-4 w-4" />} onClick={() => void submit()}>{t('common.save')}</Button></>}>
      <div className="space-y-3">
        <Field label={`${t('inv.editor.payAmount')} (${currency})`}>
          <div className="flex gap-2">
            <Input autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} className="numeric" />
            <Button variant="outline" size="sm" onClick={() => setAmount(minorToDecimalString(Math.max(0, remainingMinor)))}>{t('inv.editor.payFull')}</Button>
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('inv.editor.payDate')}><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="ltr-text" /></Field>
          <Field label={t('inv.editor.payMethod')}><Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{t(`inv.editor.methods.${m}`)}</option>)}</Select></Field>
        </div>
        <Field label={t('inv.editor.payRef')}><Input value={ref} onChange={(e) => setRef(e.target.value)} className="ltr-text" /></Field>
        <Field label={t('inv.editor.payNotes')}><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Dialog>
  )
}

function Row({ label, value, strong, muted, tone }: { label: string; value: string; strong?: boolean; muted?: boolean; tone?: 'warning' }) {
  return (
    <div className={clsx('flex items-center justify-between py-1', muted && 'text-muted', strong && 'font-semibold')}>
      <span>{label}</span>
      <span className={clsx('ltr-text', tone === 'warning' && 'text-warning')}>{value}</span>
    </div>
  )
}

function MoneyInput({ value, onChange }: { value: number; onChange: (minor: number) => void }) {
  const [text, setText] = useState(minorToDecimalString(value))
  useEffect(() => setText(minorToDecimalString(value)), [value])
  return <Input value={text} onChange={(e) => setText(e.target.value)} onBlur={() => { try { onChange(parseMinor(text)) } catch { setText(minorToDecimalString(value)) } }} className="numeric h-8" />
}

function statusTone(s: InvoiceStatus): 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent' {
  return ({ draft: 'neutral', sent: 'info', paid: 'success', partially_paid: 'warning', overdue: 'danger', cancelled: 'neutral' } as const)[s]
}

function safeWords(minor: number, currency: string, language: 'ar' | 'fr' | 'en', decimals: number): string {
  try {
    return amountInWords(minor, currency, language, decimals)
  } catch {
    return ''
  }
}

export { statusTone }
