/** معالج أول تشغيل: اللغة → المؤسسة → العملة → الضريبة → الترقيم → ابدأ. كل خطوة تحفظ فعليًا في الإعدادات. */
import { clsx } from 'clsx'
import { Check, ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatMoney, parsePercent } from '@shared/money'
import { formatDocumentNumber, validatePattern } from '@shared/numbering'
import { type CurrencyPosition, LANGUAGES, type Language } from '@shared/settings'
import { Button, Field, Input, Select } from '@renderer/components/ui'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'
import { useSettings } from '@renderer/stores/settings'

const STEPS = ['language', 'company', 'currency', 'tax', 'numbering'] as const

export function SetupWizard() {
  const { t } = useTranslation()
  const { settings, taxes, currencies, update, setLanguage, refreshTaxes } = useSettings()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [company, setCompany] = useState({ name: settings.company.name, phone: settings.company.phone, email: settings.company.email, address: settings.company.address, city: settings.company.city, country: settings.company.country, rc: settings.company.rc, nif: settings.company.nif })
  const [currency, setCurrency] = useState(settings.invoice.defaultCurrency)
  const [position, setPosition] = useState<CurrencyPosition>(settings.invoice.currencyPosition)
  const [taxId, setTaxId] = useState<number | null>(settings.invoice.defaultTaxId ?? taxes.find((x) => x.isDefault)?.id ?? null)
  const [customTax, setCustomTax] = useState('')
  const [pattern, setPattern] = useState(settings.invoice.numberPattern)

  const patternCheck = validatePattern(pattern)
  const preview = useMemo(() => (patternCheck.ok ? formatDocumentNumber(pattern, { date: new Date(), sequence: 1 }) : '—'), [pattern, patternCheck.ok])
  const currencyInfo = currencies.find((c) => c.code === currency)
  const moneyPreview = currencyInfo ? formatMoney(123456, { ...currencyInfo, position }) : ''

  const next = async () => {
    setBusy(true)
    try {
      if (step === 1) await update({ company: { ...settings.company, ...company } })
      if (step === 2) await update({ invoice: { ...settings.invoice, defaultCurrency: currency, currencyPosition: position } })
      if (step === 3) {
        let id = taxId
        if (customTax.trim()) {
          const bps = parsePercent(customTax)
          const tax = await invoke('taxes:save', { name: `TVA ${customTax.trim()}%`, rateBps: bps, isDefault: true })
          await refreshTaxes()
          id = tax.id
        } else if (id !== null) {
          const tax = taxes.find((x) => x.id === id)
          if (tax && !tax.isDefault) {
            await invoke('taxes:save', { ...tax, isDefault: true })
            await refreshTaxes()
          }
        }
        await update({ invoice: { ...useSettings.getState().settings.invoice, defaultTaxId: id } })
      }
      if (step === 4) {
        if (!patternCheck.ok) return
        await update({ invoice: { ...useSettings.getState().settings.invoice, numberPattern: pattern }, setupCompleted: true })
        return
      }
      setStep((s) => s + 1)
    } catch (e) {
      notify.error(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-bg p-6">
      <div className="card w-full max-w-2xl overflow-hidden animate-scale-in">
        <div className="flex items-center gap-3 border-b border-border bg-surface-2/40 px-6 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent/70 text-accent-fg shadow-soft"><LayoutGrid className="h-5 w-5" /></div>
          <div>
            <h1 className="text-base font-semibold">{t('wizard.welcome')}</h1>
            <p className="text-xs text-muted">{t('wizard.subtitle')}</p>
          </div>
        </div>

        <ol className="flex items-center gap-1 px-6 pt-4">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-1 items-center gap-1">
              <span className={clsx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold', i < step ? 'bg-success text-white' : i === step ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted')}>
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={clsx('truncate text-[11.5px]', i === step ? 'text-fg font-medium' : 'text-muted')}>{t(`wizard.steps.${s}`)}</span>
              {i < STEPS.length - 1 && <span className="mx-1 h-px flex-1 bg-border" />}
            </li>
          ))}
        </ol>

        <div className="min-h-[300px] px-6 py-5">
          {step === 0 && (
            <div>
              <p className="mb-4 text-[13px] text-muted">{t('wizard.languageHint')}</p>
              <div className="grid grid-cols-3 gap-2 md:grid-cols-4">
                {LANGUAGES.map((lang) => (
                  <button key={lang.code} type="button" onClick={() => void setLanguage(lang.code as Language)} className={clsx('rounded-lg border p-4 text-center transition-all', settings.language === lang.code ? 'border-accent bg-accent/10 text-accent shadow-soft' : 'border-border hover:bg-surface-2')}>
                    <div className="text-base font-semibold">{lang.label}</div>
                    <div className="mt-1 text-[11px] uppercase text-muted">{lang.code} · {lang.dir}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {step === 1 && (
            <div>
              <p className="mb-4 text-[13px] text-muted">{t('wizard.companyHint')}</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('settings.company.name')} className="col-span-2"><Input value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} autoFocus /></Field>
                <Field label={t('settings.company.phone')}><Input value={company.phone} onChange={(e) => setCompany({ ...company, phone: e.target.value })} className="ltr-text" /></Field>
                <Field label={t('settings.company.email')}><Input value={company.email} onChange={(e) => setCompany({ ...company, email: e.target.value })} className="ltr-text" /></Field>
                <Field label={t('settings.company.address')} className="col-span-2"><Input value={company.address} onChange={(e) => setCompany({ ...company, address: e.target.value })} /></Field>
                <Field label={t('settings.company.city')}><Input value={company.city} onChange={(e) => setCompany({ ...company, city: e.target.value })} /></Field>
                <Field label={t('settings.company.country')}><Input value={company.country} onChange={(e) => setCompany({ ...company, country: e.target.value })} /></Field>
                <Field label={t('settings.company.rc')}><Input value={company.rc} onChange={(e) => setCompany({ ...company, rc: e.target.value })} className="ltr-text" /></Field>
                <Field label={t('settings.company.nif')}><Input value={company.nif} onChange={(e) => setCompany({ ...company, nif: e.target.value })} className="ltr-text" /></Field>
              </div>
            </div>
          )}
          {step === 2 && (
            <div>
              <p className="mb-4 text-[13px] text-muted">{t('wizard.currencyHint')}</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('settings.invoice.defaultCurrency')}>
                  <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                    {currencies.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
                  </Select>
                </Field>
                <Field label={t('settings.invoice.currencyPosition')}>
                  <Select value={position} onChange={(e) => setPosition(e.target.value as CurrencyPosition)}>
                    <option value="after">{t('settings.invoice.after')}</option>
                    <option value="before">{t('settings.invoice.before')}</option>
                  </Select>
                </Field>
              </div>
              <div className="mt-5 rounded-lg bg-surface-2/60 p-4 text-center">
                <div className="text-xs text-muted">{t('common.preview')}</div>
                <div className="mt-1 text-2xl font-semibold ltr-text">{moneyPreview}</div>
              </div>
            </div>
          )}
          {step === 3 && (
            <div>
              <p className="mb-4 text-[13px] text-muted">{t('wizard.taxHint')}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {taxes.filter((x) => x.isActive).map((tax) => (
                  <button key={tax.id} type="button" onClick={() => { setTaxId(tax.id); setCustomTax('') }} className={clsx('rounded-lg border p-3 text-center transition-all', taxId === tax.id && !customTax ? 'border-accent bg-accent/10 text-accent' : 'border-border hover:bg-surface-2')}>
                    <div className="text-lg font-semibold ltr-text">{tax.rateBps / 100}%</div>
                    <div className="truncate text-[11px] text-muted">{tax.name}</div>
                  </button>
                ))}
              </div>
              <Field label={`${t('settings.taxes.rate')} (${t('common.optional')})`} className="mt-4 max-w-xs">
                <Input value={customTax} onChange={(e) => setCustomTax(e.target.value)} placeholder="7.5" className="ltr-text" />
              </Field>
            </div>
          )}
          {step === 4 && (
            <div>
              <p className="mb-4 text-[13px] text-muted">{t('wizard.numberingHint')}</p>
              <Field label={t('settings.invoice.pattern')} hint={t('settings.invoice.patternHint')}>
                <Input value={pattern} onChange={(e) => setPattern(e.target.value)} className="ltr-text font-mono" />
              </Field>
              <div className="mt-5 rounded-lg bg-surface-2/60 p-4 text-center">
                <div className="text-xs text-muted">{t('settings.invoice.preview')}</div>
                <div className={clsx('mt-1 text-2xl font-semibold ltr-text', !patternCheck.ok && 'text-danger')}>{preview}</div>
                {!patternCheck.ok && <div className="mt-1 text-xs text-danger">{t('settings.invoice.invalidPattern')}</div>}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <Button variant="ghost" disabled={step === 0 || busy} onClick={() => setStep((s) => s - 1)} icon={<ChevronLeft className="h-4 w-4 rtl:-scale-x-100" />}>{t('common.back')}</Button>
          <div className="flex gap-2">
            {step === 1 && <Button variant="ghost" onClick={() => setStep(2)}>{t('wizard.skip')}</Button>}
            <Button variant="primary" loading={busy} disabled={step === 4 && !patternCheck.ok} onClick={() => void next()} icon={step < 4 ? <ChevronRight className="h-4 w-4 rtl:-scale-x-100" /> : <Check className="h-4 w-4" />}>
              {step < 4 ? t('common.next') : t('wizard.start')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
