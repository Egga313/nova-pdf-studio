import { describe, expect, it } from 'vitest'
import { calcLine, calcTotals, daysOverdue, deriveStatus, isOverdue } from './calc'

describe('calcLine', () => {
  it('computes base, discount, net, tax and total exactly', () => {
    // 3 × 1050.50 = 3151.50 ; 10% خصم = 315.15 ; صافي 2836.35 ; ضريبة 19% = 538.9065 → 538.91 ; المجموع 3375.26
    const r = calcLine({ quantityMilli: 3000, unitPriceMinor: 105050, discountBps: 1000, taxBps: 1900 })
    expect(r).toEqual({ baseMinor: 315150, discountMinor: 31515, netMinor: 283635, taxMinor: 53891, totalMinor: 337526 })
  })
  it('handles fractional quantities and zero tax', () => {
    // 2.5 × 19.99 = 49.975 → 49.98 ; بلا خصم ولا ضريبة
    expect(calcLine({ quantityMilli: 2500, unitPriceMinor: 1999, discountBps: 0, taxBps: 0 })).toEqual({ baseMinor: 4998, discountMinor: 0, netMinor: 4998, taxMinor: 0, totalMinor: 4998 })
  })
  it('never drifts: 1050.50 stays 105050', () => {
    const r = calcLine({ quantityMilli: 1000, unitPriceMinor: 105050, discountBps: 0, taxBps: 0 })
    expect(r.totalMinor).toBe(105050)
  })
  it('rejects invalid input', () => {
    expect(() => calcLine({ quantityMilli: 1.5, unitPriceMinor: 100, discountBps: 0, taxBps: 0 })).toThrow()
    expect(() => calcLine({ quantityMilli: 1000, unitPriceMinor: 100, discountBps: 10_001, taxBps: 0 })).toThrow()
    expect(() => calcLine({ quantityMilli: 1000, unitPriceMinor: 100, discountBps: 0, taxBps: -1 })).toThrow()
  })
})

describe('calcTotals', () => {
  const lines = [
    { quantityMilli: 2000, unitPriceMinor: 50000, discountBps: 0, taxBps: 1900 },    // 1000.00 → tax 190.00
    { quantityMilli: 1000, unitPriceMinor: 20000, discountBps: 500, taxBps: 900 },   // 200 − 10 = 190 → tax 17.10
    { quantityMilli: 4000, unitPriceMinor: 2500, discountBps: 0, taxBps: 0 }          // 100.00 → tax 0
  ]
  it('sums lines and applies shipping/fees/paid', () => {
    const t = calcTotals({ lines, shippingMinor: 5000, feesMinor: 250, paidMinor: 40000 })
    expect(t.subtotalMinor).toBe(130000)
    expect(t.discountTotalMinor).toBe(1000)
    expect(t.taxableMinor).toBe(129000)
    expect(t.taxTotalMinor).toBe(19000 + 1710)
    expect(t.amountBeforeTaxMinor).toBe(129000 + 5000 + 250)
    expect(t.grandTotalMinor).toBe(129000 + 5250 + 20710)
    expect(t.paidMinor).toBe(40000)
    expect(t.remainingMinor).toBe(t.grandTotalMinor - 40000)
    expect(t.taxBreakdown).toEqual([
      { taxBps: 0, baseMinor: 10000, taxMinor: 0 },
      { taxBps: 900, baseMinor: 19000, taxMinor: 1710 },
      { taxBps: 1900, baseMinor: 100000, taxMinor: 19000 }
    ])
  })
  it('handles an empty invoice', () => {
    const t = calcTotals({ lines: [] })
    expect(t.grandTotalMinor).toBe(0)
    expect(t.remainingMinor).toBe(0)
    expect(t.taxBreakdown).toEqual([])
  })
  it('scenario from the spec: 100,000 invoice, 40,000 paid → remaining 60,000', () => {
    const t = calcTotals({ lines: [{ quantityMilli: 1000, unitPriceMinor: 10_000_000, discountBps: 0, taxBps: 0 }], paidMinor: 4_000_000 })
    expect(t.grandTotalMinor).toBe(10_000_000)
    expect(t.remainingMinor).toBe(6_000_000)
  })
})

describe('deriveStatus', () => {
  const today = '2026-09-06'
  it('follows payments and due date', () => {
    expect(deriveStatus('sent', 100000, 0, '2026-12-01', today)).toBe('sent')
    expect(deriveStatus('sent', 100000, 40000, '2026-12-01', today)).toBe('partially_paid')
    expect(deriveStatus('sent', 100000, 100000, '2026-12-01', today)).toBe('paid')
    expect(deriveStatus('sent', 100000, 120000, '2026-12-01', today)).toBe('paid')
    expect(deriveStatus('sent', 100000, 0, '2026-09-01', today)).toBe('overdue')
    expect(deriveStatus('sent', 100000, 40000, '2026-09-01', today)).toBe('overdue')
    expect(deriveStatus('sent', 100000, 0, null, today)).toBe('sent')
  })
  it('keeps draft and cancelled untouched', () => {
    expect(deriveStatus('draft', 100000, 100000, '2026-01-01', today)).toBe('draft')
    expect(deriveStatus('cancelled', 100000, 0, '2026-01-01', today)).toBe('cancelled')
  })
  it('overdue helpers', () => {
    expect(isOverdue('2026-09-01', 1, today)).toBe(true)
    expect(isOverdue('2026-09-01', 0, today)).toBe(false)
    expect(daysOverdue('2026-09-01', today)).toBe(5)
    expect(daysOverdue('2026-09-10', today)).toBe(0)
    expect(daysOverdue(null, today)).toBe(0)
  })
})
