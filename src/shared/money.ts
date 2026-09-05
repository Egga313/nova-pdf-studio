/**
 * تمثيل الأموال بوحدات صغرى صحيحة (Integer minor units).
 *
 * 1050.50 DZD تُخزَّن كـ 105050 (سنتيم). كل الحسابات على أعداد صحيحة، والتقريب نصف-لأعلى
 * صريح، فلا يظهر 1050.499999 أبدًا. النِّسب (خصم/ضريبة) تُمثَّل بنقاط الأساس:
 * 19% = 1900 نقطة أساس. الكميات بأجزاء الألف: 2.5 = 2500.
 */

export type Minor = number   // مبلغ بالوحدات الصغرى (عدد صحيح)
export type Bps = number     // نقاط أساس (1% = 100)
export type Milli = number   // كمية × 1000

export const BPS_SCALE = 10_000
export const QTY_SCALE = 1_000

export interface CurrencyInfo {
  code: string
  symbol: string
  decimals: number
  position: 'before' | 'after'
}

function assertInt(value: number, label: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new TypeError(`${label} must be an integer, got ${value}`)
  }
}

/** تقسيم صحيح مع تقريب نصف-لأعلى (بعيدًا عن الصفر) دون استخدام أعداد عشرية. */
export function divRound(numerator: number, denominator: number): number {
  assertInt(numerator, 'numerator')
  assertInt(denominator, 'denominator')
  if (denominator === 0) throw new RangeError('division by zero')
  const sign = Math.sign(numerator) * Math.sign(denominator) || 1
  const n = Math.abs(numerator)
  const d = Math.abs(denominator)
  const q = Math.floor(n / d)
  const r = n - q * d
  const rounded = r * 2 >= d ? q + 1 : q
  return sign * rounded
}

/** يحوّل نصًا أو عددًا عشريًا يكتبه المستخدم إلى وحدات صغرى. يقبل "1 050,50" و"1050.5". */
export function parseMinor(input: string | number, decimals = 2): Minor {
  const scale = 10 ** decimals
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new TypeError('invalid amount')
    return Math.round(input * scale)
  }
  const clean = normalizeDigits(input).replace(/\s/g, '').replace(/[^\d.,-]/g, '')
  if (!clean || clean === '-' ) return 0
  // الفاصلة الأخيرة (نقطة أو فاصلة) تُعدّ فاصلة عشرية إذا تبعها عدد أرقام لا يتجاوز الخانات العشرية
  const match = clean.match(new RegExp(`^(-?)(.*?)(?:[.,](\\d{1,${Math.max(1, decimals)}}))?$`))
  if (!match) throw new TypeError('invalid amount')
  const sign = match[1] === '-' ? -1 : 1
  const intPart = match[2].replace(/[.,]/g, '') || '0'
  const fracPart = (match[3] ?? '').padEnd(decimals, '0').slice(0, decimals)
  if (!/^\d+$/.test(intPart)) throw new TypeError('invalid amount')
  const minor = Number(intPart) * scale + (decimals > 0 ? Number(fracPart) : 0)
  if (!Number.isSafeInteger(minor)) throw new RangeError('amount too large')
  return sign * minor
}

/** يحوّل كمية مكتوبة (2.5) إلى أجزاء الألف (2500). */
export function parseQuantity(input: string | number): Milli {
  return parseMinor(input, 3)
}

/** يحوّل نسبة مكتوبة (19 أو "19,5") إلى نقاط أساس (1900 / 1950). */
export function parsePercent(input: string | number): Bps {
  return parseMinor(input, 2)
}

/** الأرقام العربية-الهندية والفارسية تُحوَّل إلى أرقام لاتينية قبل التحليل. */
export function normalizeDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (d) => {
    const code = d.charCodeAt(0)
    return String((code >= 0x06f0 ? code - 0x06f0 : code - 0x0660))
  })
}

export function minorToDecimalString(minor: Minor, decimals = 2): string {
  assertInt(minor, 'minor')
  const sign = minor < 0 ? '-' : ''
  const abs = Math.abs(minor)
  const scale = 10 ** decimals
  const whole = Math.floor(abs / scale)
  const frac = abs - whole * scale
  return decimals > 0 ? `${sign}${whole}.${String(frac).padStart(decimals, '0')}` : `${sign}${whole}`
}

export function minorToNumber(minor: Minor, decimals = 2): number {
  return Number(minorToDecimalString(minor, decimals))
}

export interface FormatOptions {
  locale?: string
  numberingSystem?: 'latn' | 'arab'
  withSymbol?: boolean
}

/**
 * تنسيق مبلغ للعرض: 1,000.00 EUR أو €1,000.00 حسب موضع الرمز.
 * الأرقام لاتينية افتراضيًا حتى تبقى واضحة في الواجهة العربية.
 */
export function formatMoney(minor: Minor, currency: CurrencyInfo, options: FormatOptions = {}): string {
  const { locale = 'en', numberingSystem = 'latn', withSymbol = true } = options
  const value = minorToNumber(minor, currency.decimals)
  const formatter = new Intl.NumberFormat(`${locale}-u-nu-${numberingSystem}`, {
    minimumFractionDigits: currency.decimals,
    maximumFractionDigits: currency.decimals
  })
  const digits = formatter.format(Math.abs(value))
  const sign = minor < 0 ? '-' : ''
  if (!withSymbol) return `${sign}${digits}`
  const symbol = currency.symbol || currency.code
  // رمز من حرف واحد (€ $ £) يلتصق بالرقم، أما الأكواد (DZD, EUR) فتُفصل بفراغ
  const glue = symbol.length <= 1 ? '' : ' '
  return currency.position === 'before' ? `${sign}${symbol}${glue}${digits}` : `${sign}${digits}${glue}${symbol}`
}

export function formatQuantity(milli: Milli, options: FormatOptions = {}): string {
  const { locale = 'en', numberingSystem = 'latn' } = options
  return new Intl.NumberFormat(`${locale}-u-nu-${numberingSystem}`, { maximumFractionDigits: 3 }).format(
    minorToNumber(milli, 3)
  )
}

export function formatPercent(bps: Bps, options: FormatOptions = {}): string {
  const { locale = 'en', numberingSystem = 'latn' } = options
  return `${new Intl.NumberFormat(`${locale}-u-nu-${numberingSystem}`, { maximumFractionDigits: 2 }).format(
    minorToNumber(bps, 2)
  )}%`
}

/** نسبة من مبلغ: amount × bps / 10000 مع تقريب نصف-لأعلى. */
export function applyBps(amount: Minor, bps: Bps): Minor {
  assertInt(amount, 'amount')
  assertInt(bps, 'bps')
  return divRound(amount * bps, BPS_SCALE)
}

/** كمية × سعر وحدة: (milli × minor) / 1000. */
export function multiplyQuantity(quantityMilli: Milli, unitPriceMinor: Minor): Minor {
  assertInt(quantityMilli, 'quantity')
  assertInt(unitPriceMinor, 'unitPrice')
  return divRound(quantityMilli * unitPriceMinor, QTY_SCALE)
}

export function sumMinor(values: Iterable<Minor>): Minor {
  let total = 0
  for (const v of values) {
    assertInt(v, 'value')
    total += v
  }
  return total
}
