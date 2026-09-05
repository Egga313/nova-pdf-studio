import { describe, expect, it } from 'vitest'
import {
  applyBps,
  divRound,
  formatMoney,
  minorToDecimalString,
  multiplyQuantity,
  normalizeDigits,
  parseMinor,
  parsePercent,
  parseQuantity,
  sumMinor
} from './money'

const DZD = { code: 'DZD', symbol: 'DZD', decimals: 2, position: 'after' as const }
const EUR = { code: 'EUR', symbol: '€', decimals: 2, position: 'before' as const }

describe('divRound', () => {
  it('rounds half up away from zero', () => {
    expect(divRound(5, 2)).toBe(3)
    expect(divRound(-5, 2)).toBe(-3)
    expect(divRound(7, 2)).toBe(4)
    expect(divRound(4, 2)).toBe(2)
    expect(divRound(1, 3)).toBe(0)
    expect(divRound(2, 3)).toBe(1)
  })
  it('rejects non-integers and zero divisor', () => {
    expect(() => divRound(1.5, 2)).toThrow()
    expect(() => divRound(1, 0)).toThrow()
  })
})

describe('parseMinor', () => {
  it('parses user input in several notations', () => {
    expect(parseMinor('1050.50')).toBe(105050)
    expect(parseMinor('1 050,50')).toBe(105050)
    expect(parseMinor('1,050.5')).toBe(105050)
    expect(parseMinor('1.050,5')).toBe(105050)
    expect(parseMinor('1050')).toBe(105000)
    expect(parseMinor('-12.3')).toBe(-1230)
    expect(parseMinor('')).toBe(0)
    expect(parseMinor(19.99)).toBe(1999)
  })
  it('never produces floating point drift', () => {
    expect(parseMinor('1050.50')).toBe(105050)
    expect(minorToDecimalString(105050)).toBe('1050.50')
    expect(minorToDecimalString(-5)).toBe('-0.05')
    expect(minorToDecimalString(100, 0)).toBe('100')
  })
  it('converts arabic-indic digits', () => {
    expect(normalizeDigits('١٢٣٤')).toBe('1234')
    expect(parseMinor('١٢٣٤,٥٠')).toBe(123450)
  })
})

describe('percent and quantity scales', () => {
  it('parses percentages to basis points', () => {
    expect(parsePercent('19')).toBe(1900)
    expect(parsePercent('9.5')).toBe(950)
    expect(parsePercent(0)).toBe(0)
  })
  it('parses quantities to thousandths', () => {
    expect(parseQuantity('2.5')).toBe(2500)
    expect(parseQuantity('3')).toBe(3000)
    expect(parseQuantity('0.125')).toBe(125)
  })
  it('applies percentages with exact rounding', () => {
    expect(applyBps(100_000, 1900)).toBe(19_000)     // 19% of 1000.00 = 190.00
    expect(applyBps(105050, 1900)).toBe(19960)       // 199.595 → 199.60
    expect(applyBps(1, 5000)).toBe(1)                // 0.5 → 1 (half up)
    expect(applyBps(333, 3333)).toBe(111)            // 110.99 → 111
  })
  it('multiplies quantity by unit price', () => {
    expect(multiplyQuantity(2500, 1999)).toBe(4998)  // 2.5 × 19.99 = 49.975 → 49.98
    expect(multiplyQuantity(3000, 105050)).toBe(315150)
    expect(multiplyQuantity(0, 5)).toBe(0)
  })
  it('sums safely', () => {
    expect(sumMinor([1, 2, 3])).toBe(6)
    expect(() => sumMinor([1.5])).toThrow()
  })
})

describe('formatMoney', () => {
  it('places symbol before or after', () => {
    expect(formatMoney(100_000, DZD)).toBe('1,000.00 DZD')
    expect(formatMoney(100_000, EUR)).toBe('€1,000.00')
    expect(formatMoney(-2550, EUR)).toBe('-€25.50')
    expect(formatMoney(100_000, DZD, { withSymbol: false })).toBe('1,000.00')
  })
  it('keeps latin digits in arabic locale by default', () => {
    const text = formatMoney(123456, DZD, { locale: 'ar' })
    expect(text).toMatch(/1[,.٫٬  ]?234[.,٫]56/)
    expect(text).not.toMatch(/[٠-٩]/)
  })
  it('can render arabic-indic digits when requested', () => {
    expect(formatMoney(1200, DZD, { locale: 'ar', numberingSystem: 'arab' })).toMatch(/[٠-٩]/)
  })
})
