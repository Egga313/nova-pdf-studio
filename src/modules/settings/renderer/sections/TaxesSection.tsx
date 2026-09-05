/** الملفات الضريبية: إضافة/تعديل/حذف/افتراضي — لا نسبة ثابتة مفروضة. */
import { Plus, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Tax } from '@shared/entities'
import { formatPercent, parsePercent } from '@shared/money'
import { Badge, Button, Dialog, Field, Input, SectionTitle, Switch } from '@renderer/components/ui'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'
import { useSettings } from '@renderer/stores/settings'
import { Group } from './shared'

export function TaxesSection() {
  const { t } = useTranslation()
  const { taxes, refreshTaxes, settings } = useSettings()
  const [editing, setEditing] = useState<Partial<Tax> | null>(null)
  const [rateText, setRateText] = useState('')
  const [busy, setBusy] = useState(false)

  const openNew = () => {
    setEditing({ name: '', rateBps: 0, isDefault: false, isActive: true })
    setRateText('')
  }
  const openEdit = (tax: Tax) => {
    setEditing(tax)
    setRateText(String(tax.rateBps / 100))
  }

  const submit = async () => {
    if (!editing) return
    setBusy(true)
    try {
      const rateBps = parsePercent(rateText || '0')
      await invoke('taxes:save', { ...editing, name: editing.name ?? '', rateBps })
      await refreshTaxes()
      setEditing(null)
      notify.success('toast.saved')
    } catch (e) {
      notify.error(e)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (tax: Tax) => {
    if (settings.general.confirmBeforeDelete && !window.confirm(t('settings.taxes.deleteConfirm'))) return
    try {
      await invoke('taxes:delete', { id: tax.id })
      await refreshTaxes()
    } catch (e) {
      notify.error(e)
    }
  }

  const setDefault = async (tax: Tax) => {
    try {
      await invoke('taxes:save', { ...tax, isDefault: true })
      await refreshTaxes()
    } catch (e) {
      notify.error(e)
    }
  }

  return (
    <>
      <SectionTitle hint={t('settings.taxes.hint')}>{t('settings.taxes.title')}</SectionTitle>
      <Group>
        <table className="w-full text-[13px]">
          <thead className="text-xs text-muted">
            <tr className="border-b border-border text-start">
              <th className="py-2 text-start font-medium">{t('settings.taxes.name')}</th>
              <th className="py-2 text-start font-medium">{t('settings.taxes.rate')}</th>
              <th className="py-2 text-start font-medium">{t('common.active')}</th>
              <th className="py-2 text-end font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {taxes.map((tax) => (
              <tr key={tax.id} className="group">
                <td className="py-2.5">
                  <button type="button" className="font-medium hover:text-accent" onClick={() => openEdit(tax)}>{tax.name}</button>
                  {tax.isDefault && <Badge tone="accent" className="ms-2">{t('common.default')}</Badge>}
                </td>
                <td className="py-2.5 ltr-text">{formatPercent(tax.rateBps)}</td>
                <td className="py-2.5">{tax.isActive ? <Badge tone="success">{t('common.active')}</Badge> : <Badge>{t('common.inactive')}</Badge>}</td>
                <td className="py-2.5 text-end">
                  <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {!tax.isDefault && tax.isActive && <Button variant="ghost" size="icon" className="h-7 w-7" title={t('common.default')} onClick={() => void setDefault(tax)}><Star className="h-3.5 w-3.5" /></Button>}
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-danger" title={t('common.delete')} onClick={() => void remove(tax)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Button className="mt-3" icon={<Plus className="h-4 w-4" />} onClick={openNew}>{t('settings.taxes.add')}</Button>
      </Group>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? t('common.edit') : t('settings.taxes.add')} width="max-w-sm"
        footer={<><Button variant="ghost" onClick={() => setEditing(null)}>{t('common.cancel')}</Button><Button variant="primary" loading={busy} onClick={() => void submit()}>{t('common.save')}</Button></>}>
        {editing && (
          <div className="space-y-3">
            <Field label={t('settings.taxes.name')} required><Input autoFocus value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="TVA 19%" /></Field>
            <Field label={t('settings.taxes.rate')} required><Input value={rateText} onChange={(e) => setRateText(e.target.value)} placeholder="19" className="ltr-text" /></Field>
            <Switch label={t('settings.taxes.default')} checked={!!editing.isDefault} onChange={(v) => setEditing({ ...editing, isDefault: v })} />
            <Switch label={t('common.active')} checked={editing.isActive !== false} onChange={(v) => setEditing({ ...editing, isActive: v })} />
          </div>
        )}
      </Dialog>
    </>
  )
}
