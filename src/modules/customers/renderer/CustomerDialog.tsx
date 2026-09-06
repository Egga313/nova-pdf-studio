/** حوار إنشاء/تعديل عميل — يُستخدم من قائمة العملاء، ملف العميل، ومحرّر الفاتورة. */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Customer, CustomerInput } from '@shared/invoicing'
import { Button, Dialog, Field, Input, Textarea } from '@renderer/components/ui'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'

const EMPTY: CustomerInput = { firstName: '', lastName: '', companyName: '', address: '', city: '', country: '', phone: '', email: '', taxId: '', notes: '' }

export function CustomerDialog({ open, onClose, onSaved, customer }: { open: boolean; onClose: () => void; onSaved: (c: Customer) => void; customer?: Customer | null }) {
  const { t } = useTranslation()
  const [form, setForm] = useState<CustomerInput>(EMPTY)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!open) return
    setForm(customer ? { id: customer.id, customerNumber: customer.customerNumber, firstName: customer.firstName, lastName: customer.lastName, companyName: customer.companyName, address: customer.address, city: customer.city, country: customer.country, phone: customer.phone, email: customer.email, taxId: customer.taxId, notes: customer.notes } : EMPTY)
  }, [open, customer])

  const set = (k: keyof CustomerInput, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const submit = async () => {
    setBusy(true)
    try {
      const saved = await invoke('customers:save', form)
      notify.success('cust.saved')
      onSaved(saved)
    } catch (e) {
      notify.error(e)
    } finally {
      setBusy(false)
    }
  }
  const F = (k: keyof CustomerInput, ltr = false, wide = false) => (
    <Field label={t(`cust.fields.${k}`)} className={wide ? 'sm:col-span-2' : ''}>
      <Input value={String(form[k] ?? '')} onChange={(e) => set(k, e.target.value)} className={ltr ? 'ltr-text' : ''} autoFocus={k === 'companyName'} />
    </Field>
  )
  return (
    <Dialog open={open} onClose={onClose} title={customer ? t('cust.edit') : t('cust.new')} width="max-w-lg"
      footer={<><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" loading={busy} onClick={() => void submit()}>{t('common.save')}</Button></>}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        {F('companyName', false, true)}
        {F('firstName')}
        {F('lastName')}
        {F('phone', true)}
        {F('email', true)}
        {F('address', false, true)}
        {F('city')}
        {F('country')}
        {F('taxId', true)}
        <Field label={t('cust.fields.customerNumber')}><Input value={form.customerNumber ?? ''} onChange={(e) => set('customerNumber', e.target.value)} placeholder="CUS-00001" className="ltr-text" /></Field>
        <Field label={t('cust.fields.notes')} className="sm:col-span-2"><Textarea value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} className="min-h-[60px]" /></Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}
