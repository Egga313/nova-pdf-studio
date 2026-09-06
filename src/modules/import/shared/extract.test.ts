import { describe, expect, it } from 'vitest'
import {
  autoExtract, classifyAmountLine, detectFields, detectItems, extractWithDefinition, groupLines, isNumericText, normalizeSeparators, parseAmountText, parseDateText,
  parseQtyText, templateScore, toInvoicePrefill, type Span
} from './extract'

const span = (text: string, x: number, y: number, width = text.length * 5, height = 10): Span => ({ text, x, y, width, height })

describe('numbers', () => {
  it('normalizes ar/fr/en separators', () => {
    expect(normalizeSeparators('1 250,50')).toBe('1250.50')
    expect(normalizeSeparators('1,250.50')).toBe('1250.50')
    expect(normalizeSeparators('1.250,50')).toBe('1250.50')
    expect(normalizeSeparators('1,250')).toBe('1250')
    expect(normalizeSeparators('1.250.500')).toBe('1250500')
    expect(normalizeSeparators('12,5')).toBe('12.5')
    expect(normalizeSeparators('-42000.5')).toBe('-42000.5')
  })
  it('parses amounts with currency text and arabic digits', () => {
    expect(parseAmountText('Total TTC : 1 250,50 DZD')?.minor).toBe(125050)
    expect(parseAmountText('المجموع ١٢٥٠٫٥٠ دج')?.minor).toBe(125050)
    expect(parseAmountText('Total 12/05/2026')).toBeNull()
    expect(parseAmountText('TVA 19% 2 250,00', 2, 'last')?.minor).toBe(225000)
    expect(parseQtyText('2,5')).toBe(2500)
    expect(isNumericText('185 000,00')).toBe(true)
    expect(isNumericText('12/05/2026')).toBe(false)
    expect(isNumericText('P-001')).toBe(false)
  })
})

describe('dates', () => {
  it('parses numeric and textual dates', () => {
    expect(parseDateText('Date : 12/05/2026')).toBe('2026-05-12')
    expect(parseDateText('05-12-2026')).toBe('2026-12-05')
    expect(parseDateText('2026-05-12')).toBe('2026-05-12')
    expect(parseDateText('12 mars 2026')).toBe('2026-03-12')
    expect(parseDateText('March 3, 2026')).toBe('2026-03-03')
    expect(parseDateText('٠٩/٠٦/٢٠٢٦')).toBe('2026-06-09')
    expect(parseDateText('12 كانون الثاني 2026')).toBe('2026-01-12')
    expect(parseDateText('hello')).toBeNull()
  })
})

describe('lines and fields', () => {
  const page: Span[] = [
    span('Société Atlas SARL', 40, 40, 120, 12),
    span('12 rue des Oliviers · Tél : 021 55 44 33', 40, 55, 200, 10),
    span('Facture N° F2026-0045', 40, 80, 130, 10),
    span('Date : 12/05/2026', 300, 80, 100, 10), span('Échéance : 11/06/2026', 420, 80, 110, 10),
    span('Client :', 40, 110, 40, 10), span('Entreprise Nour', 90, 110, 90, 10),
    span('Tél : 0555 12 34 56', 40, 125, 100, 10),
    span('Désignation', 40, 160, 60, 10), span('Qté', 300, 160, 20, 10), span('P.U. HT', 360, 160, 40, 10), span('Montant HT', 460, 160, 60, 10),
    span('Ordinateur portable', 40, 180, 100, 10), span('2', 305, 180, 6, 10), span('185 000,00', 360, 180, 55, 10), span('370 000,00', 460, 180, 55, 10),
    span('Câble HDMI', 40, 195, 60, 10), span('10', 305, 195, 10, 10), span('850,00', 360, 195, 35, 10), span('8 500,00', 460, 195, 45, 10),
    span('Total HT', 360, 240, 45, 10), span('378 500,00', 460, 240, 55, 10),
    span('TVA 19%', 360, 255, 45, 10), span('71 915,00', 460, 255, 50, 10),
    span('Total TTC', 360, 270, 50, 10), span('450 415,00', 460, 270, 55, 10)
  ]
  it('groups spans into lines by y', () => {
    const lines = groupLines(page)
    expect(lines[2].text).toBe('Facture N° F2026-0045 Date : 12/05/2026 Échéance : 11/06/2026')
    expect(classifyAmountLine(lines[lines.length - 1])).toBe('total')
    expect(classifyAmountLine(lines[lines.length - 3])).toBe('subtotal')
    expect(classifyAmountLine(lines[lines.length - 2])).toBe('tax')
  })
  it('detects header fields', () => {
    const f = detectFields(groupLines(page))
    expect(f.number?.value).toBe('F2026-0045')
    expect(f.issueDate?.value).toBe('2026-05-12')
    expect(f.dueDate?.value).toBe('2026-06-11')
    expect(f.customerName?.value).toBe('Entreprise Nour')
    expect(f.customerPhone?.value).toBe('0555 12 34 56') // هاتف العميل لا هاتف المورّد
    expect(f.subtotal?.value).toBe('378500.00')
    expect(f.tax?.value).toBe('71915.00')
    expect(f.total?.value).toBe('450415.00')
  })
  it('detects items using header columns and verifies totals', () => {
    const items = detectItems(groupLines(page))
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ name: 'Ordinateur portable', quantityMilli: 2000, unitPriceMinor: 18500000, totalMinor: 37000000 })
    expect(items[1]).toMatchObject({ name: 'Câble HDMI', quantityMilli: 10000, unitPriceMinor: 85000 })
    const inv = autoExtract([page])
    // الضريبة الإجمالية 19% تُستنتج وتُطبَّق على البنود فيطابق المحسوب الإجمالي TTC
    expect(inv.items.every((it) => it.taxBps === 1900)).toBe(true)
    expect(inv.computedItemsTotalMinor).toBe(45041500)
    expect(inv.warnings.map((w) => w.code)).not.toContain('items_total_mismatch')
    expect(inv.warnings.map((w) => w.code)).not.toContain('total_mismatch')
    const prefill = toInvoicePrefill(inv, { taxBps: 900, taxName: 'TVA 9%' })
    expect(prefill.header.reference).toBe('F2026-0045')
    expect(prefill.header.dueDate).toBe('2026-06-11')
    expect(prefill.header.customerSnapshot?.displayName).toBe('Entreprise Nour')
    expect(prefill.items[0].taxBps).toBe(1900)
  })
  it('handles arabic RTL lines split into visual spans', () => {
    const ar: Span[] = [
      span('الفاتورة', 500, 40, 40, 10), span('رقم', 545, 40, 20, 10), span('INV-2026-00007', 380, 40, 90, 10),
      span('العميل', 540, 70, 30, 10), span(':', 535, 70, 4, 10), span('شركة النور للتجارة', 400, 70, 110, 10),
      span('الإجمالي', 520, 200, 40, 10), span('٤٥٠٬٤١٥٫٠٠', 400, 200, 60, 10)
    ]
    const f = detectFields(groupLines(ar))
    expect(f.number?.value).toBe('INV-2026-00007')
    expect(f.customerName?.value).toBe('شركة النور للتجارة')
    expect(f.total?.value).toBe('450415.00')
  })
  it('extracts by zones with column splits', () => {
    const inv = extractWithDefinition([page], [{ w: 595, h: 842 }], {
      version: 1, pageWidthPt: 595, pageHeightPt: 842, keywords: ['Atlas'], language: 'fr', decimals: 2,
      zones: [
        { id: 'z1', field: 'number', page: 0, rect: { x: 0.05, y: 0.08, w: 0.35, h: 0.03 } },
        { id: 'z2', field: 'total', page: 0, rect: { x: 0.6, y: 0.31, w: 0.35, h: 0.03 } },
        { id: 'z3', field: 'items', page: 0, rect: { x: 0.05, y: 0.185, w: 0.9, h: 0.06 }, hasHeaderRow: true, columns: [
          { column: 'description', x: 0, w: 0.45 }, { column: 'qty', x: 0.45, w: 0.13 }, { column: 'unitPrice', x: 0.58, w: 0.2 }, { column: 'total', x: 0.78, w: 0.22 }
        ] }
      ]
    })
    expect(inv.fields.number?.value).toBe('F2026-0045')
    expect(inv.fields.total?.value).toBe('450415.00')
    expect(inv.fields.customerName?.value).toBe('Entreprise Nour') // من الكشف التلقائي (هجين)
    expect(inv.items).toHaveLength(2)
    expect(inv.items[1].quantityMilli).toBe(10000)
    expect(templateScore(inv.pageText, ['Atlas', 'SARL'])).toBe(1)
    expect(templateScore(inv.pageText, ['Zebra'])).toBe(0)
  })
})
