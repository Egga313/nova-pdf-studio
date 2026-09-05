/** إعدادات الفواتير: أنماط الترقيم مع معاينة حية، العملة، موضع الرمز، الضريبة الافتراضية، الاستحقاق، الملاحظات. */
import { clsx } from 'clsx'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDocumentNumber, validatePattern } from '@shared/numbering'
import type { InvoiceSettings } from '@shared/settings'
import { Button, Field, Input, SectionTitle, Select, Switch, Textarea } from '@renderer/components/ui'
import { useSettings } from '@renderer/stores/settings'
import { Group, useSaveSettings } from './shared'

const PATTERNS: (keyof InvoiceSettings)[] = ['numberPattern', 'quotePattern', 'proformaPattern', 'receiptPattern']
const PATTERN_LABEL: Record<string, string> = { numberPattern: 'pattern', quotePattern: 'quotePattern', proformaPattern: 'proformaPattern', receiptPattern: 'receiptPattern' }

export function InvoiceSection() {
  const { t } = useTranslation()
  const { settings, taxes, currencies } = useSettings()
  const save = useSaveSettings()
  const [form, setForm] = useState<InvoiceSettings>(settings.invoice)
  useEffect(() => setForm(settings.invoice), [settings.invoice])
  const dirty = JSON.stringify(form) !== JSON.stringify(settings.invoice)
  const invalid = PATTERNS.some((p) => !validatePattern(String(form[p])).ok)
  const set = <K extends keyof InvoiceSettings>(k: K, v: InvoiceSettings[K]) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <>
      <SectionTitle>{t('settings.sections.invoice')}</SectionTitle>
      <Group title={t('settings.sections.numbering')} hint={t('settings.invoice.patternHint')}>
        <div className="grid gap-3 sm:grid-cols-2">
          {PATTERNS.map((p) => {
            const check = validatePattern(String(form[p]))
            return (
              <Field key={p} label={t(`settings.invoice.${PATTERN_LABEL[p]}`)}>
                <Input value={String(form[p])} onChange={(e) => set(p, e.target.value as never)} className={clsx('ltr-text font-mono', !check.ok && 'border-danger')} />
                <span className={clsx('mt-1 block text-[11.5px] ltr-text', check.ok ? 'text-muted' : 'text-danger')}>
                  {check.ok ? `${t('settings.invoice.preview')}: ${formatDocumentNumber(String(form[p]), { date: new Date(), sequence: 1 })}` : t('settings.invoice.invalidPattern')}
                </span>
              </Field>
            )
          })}
        </div>
      </Group>
      <Group>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('settings.invoice.defaultCurrency')}>
            <Select value={form.defaultCurrency} onChange={(e) => set('defaultCurrency', e.target.value)}>
              {currencies.filter((c) => c.isActive).map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
            </Select>
          </Field>
          <Field label={t('settings.invoice.currencyPosition')}>
            <Select value={form.currencyPosition} onChange={(e) => set('currencyPosition', e.target.value as 'before' | 'after')}>
              <option value="after">{t('settings.invoice.after')}</option>
              <option value="before">{t('settings.invoice.before')}</option>
            </Select>
          </Field>
          <Field label={t('settings.invoice.defaultTax')}>
            <Select value={form.defaultTaxId ?? ''} onChange={(e) => set('defaultTaxId', e.target.value ? Number(e.target.value) : null)}>
              <option value="">{t('common.none')}</option>
              {taxes.filter((x) => x.isActive).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
          </Field>
          <Field label={t('settings.invoice.dueDays')}>
            <Input type="number" min={0} max={365} value={form.defaultDueDays} onChange={(e) => set('defaultDueDays', Math.max(0, Number(e.target.value) || 0))} className="numeric" />
          </Field>
          <Field label={t('settings.invoice.defaultNotes')} className="sm:col-span-2"><Textarea value={form.defaultNotes} onChange={(e) => set('defaultNotes', e.target.value)} /></Field>
          <Field label={t('settings.invoice.paymentTerms')} className="sm:col-span-2"><Textarea value={form.defaultPaymentTerms} onChange={(e) => set('defaultPaymentTerms', e.target.value)} /></Field>
        </div>
        <div className="mt-2">
          <Switch label={t('settings.invoice.amountInWords')} checked={form.amountInWords} onChange={(v) => set('amountInWords', v)} />
          <Switch label={t('settings.invoice.showLogo')} checked={form.showLogo} onChange={(v) => set('showLogo', v)} />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" disabled={!dirty} onClick={() => setForm(settings.invoice)}>{t('common.reset')}</Button>
          <Button variant="primary" disabled={!dirty || invalid} onClick={() => void save({ invoice: form })}>{t('common.save')}</Button>
        </div>
      </Group>
    </>
  )
}
