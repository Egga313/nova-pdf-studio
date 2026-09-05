/** تنسيق التاريخ والمال والأحجام حسب إعدادات المستخدم (الأرقام لاتينية افتراضيًا). */
import { formatMoney as formatMoneyCore, formatPercent as formatPercentCore, formatQuantity as formatQuantityCore, type Minor } from '@shared/money'
import { intlLocale } from '@modules/translations/renderer/i18n'
import { currentCurrency, useSettings } from '@renderer/stores/settings'

function opts() {
  const { settings } = useSettings.getState()
  return { locale: intlLocale(settings.language), numberingSystem: settings.general.numberingSystem }
}

export function fmtMoney(minor: Minor, currencyCode?: string, withSymbol = true): string {
  return formatMoneyCore(minor, currentCurrency(currencyCode), { ...opts(), withSymbol })
}

export function fmtQuantity(milli: number): string {
  return formatQuantityCore(milli, opts())
}

export function fmtPercent(bps: number): string {
  return formatPercentCore(bps, opts())
}

export function fmtDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return ''
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(date.getTime())) return iso
  const { settings } = useSettings.getState()
  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const y = String(date.getFullYear())
  let text = settings.general.dateFormat === 'MM/DD/YYYY' ? `${m}/${d}/${y}` : settings.general.dateFormat === 'YYYY-MM-DD' ? `${y}-${m}-${d}` : `${d}/${m}/${y}`
  if (withTime) text += ` ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  return text
}

export function fmtRelative(iso: string, t: (key: string, params?: Record<string, unknown>) => string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(diff / 60000)
  if (minutes < 1) return t('time.justNow')
  if (minutes < 60) return t('time.minutesAgo', { count: minutes })
  const hours = Math.round(minutes / 60)
  if (hours < 24) return t('time.hoursAgo', { count: hours })
  const days = Math.round(hours / 24)
  if (days < 7) return t('time.daysAgo', { count: days })
  return fmtDate(iso)
}

export function fmtBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function fmtMonthLabel(yyyyMm: string, language: string): string {
  const [y, m] = yyyyMm.split('-').map(Number)
  return new Intl.DateTimeFormat(`${intlLocale(language as never)}-u-nu-latn`, { month: 'short' }).format(new Date(y, m - 1, 1))
}
