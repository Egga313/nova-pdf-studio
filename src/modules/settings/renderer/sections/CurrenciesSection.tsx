/** العملات: إضافة أي عملة بالرمز ISO مع الرمز المعروض وموضعه وخاناته العشرية، ومعاينة فورية. */
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Currency } from '@shared/entities'
import { formatMoney } from '@shared/money'
import { Badge, Button, Dialog, Field, Input, SectionTitle, Select } from '@renderer/components/ui'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'
import { useSettings } from '@renderer/stores/settings'
import { Group } from './shared'

const EMPTY: Partial<Currency> = { code: '', name: '', symbol: '', decimals: 2, position: 'after', isActive: true }

export function CurrenciesSection() {
  const { t } = useTranslation()
  const { currencies, refreshCurrencies, settings } = useSettings()
  const [editing, setEditing] = useState<Partial<Currency> | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!editing) return
    setBusy(true)
    try {
      await invoke('currencies:save', { ...editing, code: editing.code ?? '', name: editing.name ?? '', symbol: editing.symbol ?? '' })
      await refreshCurrencies()
      setEditing(null)
      notify.success('toast.saved')
    } catch (e) {
      notify.error(e)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (c: Currency) => {
    if (settings.general.confirmBeforeDelete && !window.confirm(t('settings.currencies.deleteConfirm'))) return
    try {
      await invoke('currencies:delete', { code: c.code })
      await refreshCurrencies()
    } catch (e) {
      notify.error(e)
    }
  }

  const preview = editing && editing.code ? formatMoney(123456, { code: editing.code, symbol: editing.symbol || editing.code, decimals: editing.decimals ?? 2, position: editing.position ?? 'after' }) : ''

  return (
    <>
      <SectionTitle hint={t('settings.currencies.hint')}>{t('settings.currencies.title')}</SectionTitle>
      <Group>
        <table className="w-full text-[13px]">
          <thead className="text-xs text-muted">
            <tr className="border-b border-border">
              <th className="py-2 text-start font-medium">{t('settings.currencies.code')}</th>
              <th className="py-2 text-start font-medium">{t('settings.currencies.name')}</th>
              <th className="py-2 text-start font-medium">{t('common.preview')}</th>
              <th className="py-2 text-end font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {currencies.map((c) => (
              <tr key={c.code} className="group">
                <td className="py-2.5"><button type="button" className="font-medium ltr-text hover:text-accent" onClick={() => setEditing(c)}>{c.code}</button>{c.code === settings.invoice.defaultCurrency && <Badge tone="accent" className="ms-2">{t('common.default')}</Badge>}{!c.isActive && <Badge className="ms-2">{t('common.inactive')}</Badge>}</td>
                <td className="py-2.5">{c.name}</td>
                <td className="py-2.5 ltr-text">{formatMoney(123456, c)}</td>
                <td className="py-2.5 text-end">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-danger opacity-0 group-hover:opacity-100" disabled={c.code === settings.invoice.defaultCurrency} onClick={() => void remove(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Button className="mt-3" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing(EMPTY)}>{t('settings.currencies.add')}</Button>
      </Group>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={t('settings.currencies.add')} width="max-w-sm"
        footer={<><Button variant="ghost" onClick={() => setEditing(null)}>{t('common.cancel')}</Button><Button variant="primary" loading={busy} onClick={() => void submit()}>{t('common.save')}</Button></>}>
        {editing && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('settings.currencies.code')} required><Input autoFocus value={editing.code ?? ''} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} placeholder="MAD" className="ltr-text" maxLength={5} disabled={currencies.some((c) => c.code === editing.code && editing.createdAt)} /></Field>
              <Field label={t('settings.currencies.symbol')} required><Input value={editing.symbol ?? ''} onChange={(e) => setEditing({ ...editing, symbol: e.target.value })} placeholder="DH" className="ltr-text" /></Field>
            </div>
            <Field label={t('settings.currencies.name')} required><Input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('settings.currencies.decimals')}><Input type="number" min={0} max={4} value={editing.decimals ?? 2} onChange={(e) => setEditing({ ...editing, decimals: Number(e.target.value) })} className="numeric" /></Field>
              <Field label={t('settings.currencies.position')}>
                <Select value={editing.position ?? 'after'} onChange={(e) => setEditing({ ...editing, position: e.target.value as 'before' | 'after' })}>
                  <option value="after">{t('settings.invoice.after')}</option>
                  <option value="before">{t('settings.invoice.before')}</option>
                </Select>
              </Field>
            </div>
            {preview && <div className="rounded-md bg-surface-2/60 p-3 text-center text-lg font-semibold ltr-text">{preview}</div>}
          </div>
        )}
      </Dialog>
    </>
  )
}
