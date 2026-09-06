/**
 * محرّك حساب الفواتير — المصدر الوحيد للحقيقة المالية.
 *
 * لكل سطر:   Base = Qty × UnitPrice
 *            Discount = Base × Discount%
 *            Net = Base − Discount
 *            Tax = Net × Tax%
 *            LineTotal = Net + Tax
 * للفاتورة:  Subtotal = Σ Base · TotalDiscount = Σ Discount · Taxable = Σ Net · TaxTotal = Σ Tax
 *            AmountBeforeTax = Taxable + Shipping + Fees
 *            GrandTotal = AmountBeforeTax + TaxTotal
 *            Remaining = GrandTotal − Paid
 *
 * كل شيء أعداد صحيحة (وحدات صغرى / نقاط أساس / أجزاء الألف) مع تقريب نصف-لأعلى في كل سطر على حدة،
 * ثم جمع الأسطر، وهو السلوك المتوقع في المحاسبة (تقريب على مستوى السطر).
 */
import { applyBps, type Bps, type Milli, type Minor, multiplyQuantity, sumMinor } from '@shared/money'
import type { InvoiceStatus } from '@shared/invoicing'

export interface LineInput {
  quantityMilli: Milli
  unitPriceMinor: Minor
  discountBps: Bps
  taxBps: Bps
}

export interface LineResult {
  baseMinor: Minor
  discountMinor: Minor
  netMinor: Minor
  taxMinor: Minor
  totalMinor: Minor
}

export interface TotalsInput {
  lines: LineInput[]
  shippingMinor?: Minor
  feesMinor?: Minor
  paidMinor?: Minor
}

export interface TotalsResult {
  lines: LineResult[]
  subtotalMinor: Minor
  discountTotalMinor: Minor
  taxableMinor: Minor
  taxTotalMinor: Minor
  shippingMinor: Minor
  feesMinor: Minor
  amountBeforeTaxMinor: Minor
  grandTotalMinor: Minor
  paidMinor: Minor
  remainingMinor: Minor
  taxBreakdown: { taxBps: Bps; baseMinor: Minor; taxMinor: Minor }[]
}

function assertInt(v: number, label: string): void {
  if (!Number.isInteger(v)) throw new TypeError(`${label} must be an integer, got ${v}`)
}

export function calcLine(line: LineInput): LineResult {
  assertInt(line.quantityMilli, 'quantityMilli')
  assertInt(line.unitPriceMinor, 'unitPriceMinor')
  assertInt(line.discountBps, 'discountBps')
  assertInt(line.taxBps, 'taxBps')
  if (line.discountBps < 0 || line.discountBps > 10_000) throw new RangeError('discount must be between 0% and 100%')
  if (line.taxBps < 0) throw new RangeError('tax cannot be negative')
  const baseMinor = multiplyQuantity(line.quantityMilli, line.unitPriceMinor)
  const discountMinor = applyBps(baseMinor, line.discountBps)
  const netMinor = baseMinor - discountMinor
  const taxMinor = applyBps(netMinor, line.taxBps)
  return { baseMinor, discountMinor, netMinor, taxMinor, totalMinor: netMinor + taxMinor }
}

export function calcTotals(input: TotalsInput): TotalsResult {
  const lines = input.lines.map(calcLine)
  const shippingMinor = input.shippingMinor ?? 0
  const feesMinor = input.feesMinor ?? 0
  const paidMinor = input.paidMinor ?? 0
  assertInt(shippingMinor, 'shippingMinor')
  assertInt(feesMinor, 'feesMinor')
  assertInt(paidMinor, 'paidMinor')

  const subtotalMinor = sumMinor(lines.map((l) => l.baseMinor))
  const discountTotalMinor = sumMinor(lines.map((l) => l.discountMinor))
  const taxableMinor = sumMinor(lines.map((l) => l.netMinor))
  const taxTotalMinor = sumMinor(lines.map((l) => l.taxMinor))
  const amountBeforeTaxMinor = taxableMinor + shippingMinor + feesMinor
  const grandTotalMinor = amountBeforeTaxMinor + taxTotalMinor
  const remainingMinor = grandTotalMinor - paidMinor

  const breakdown = new Map<Bps, { baseMinor: Minor; taxMinor: Minor }>()
  input.lines.forEach((l, i) => {
    const entry = breakdown.get(l.taxBps) ?? { baseMinor: 0, taxMinor: 0 }
    entry.baseMinor += lines[i].netMinor
    entry.taxMinor += lines[i].taxMinor
    breakdown.set(l.taxBps, entry)
  })

  return {
    lines, subtotalMinor, discountTotalMinor, taxableMinor, taxTotalMinor, shippingMinor, feesMinor,
    amountBeforeTaxMinor, grandTotalMinor, paidMinor, remainingMinor,
    taxBreakdown: [...breakdown.entries()].sort((a, b) => a[0] - b[0]).map(([taxBps, v]) => ({ taxBps, ...v }))
  }
}

/**
 * حالة الفاتورة المحسوبة من المدفوعات والتاريخ.
 * - cancelled و draft لا تتغيران تلقائيًا.
 * - مدفوعة بالكامل → paid؛ دفعة جزئية → partially_paid؛ متأخرة (بعد الاستحقاق وبقي مبلغ) → overdue؛ وإلا تبقى sent.
 */
export function deriveStatus(current: InvoiceStatus, grandTotalMinor: Minor, paidMinor: Minor, dueDate: string | null, today: string): InvoiceStatus {
  if (current === 'cancelled' || current === 'draft') return current
  const remaining = grandTotalMinor - paidMinor
  if (grandTotalMinor > 0 && remaining <= 0) return 'paid'
  const overdue = !!dueDate && dueDate < today && remaining > 0
  if (paidMinor > 0) return overdue ? 'overdue' : 'partially_paid'
  return overdue ? 'overdue' : 'sent'
}

export function isOverdue(dueDate: string | null, remainingMinor: Minor, today: string): boolean {
  return !!dueDate && dueDate < today && remainingMinor > 0
}

export function daysOverdue(dueDate: string | null, today: string): number {
  if (!dueDate || dueDate >= today) return 0
  return Math.floor((Date.parse(today) - Date.parse(dueDate)) / 86_400_000)
}
