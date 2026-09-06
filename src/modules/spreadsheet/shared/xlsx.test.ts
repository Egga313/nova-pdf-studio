import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { cellValue, newSheet, setCellInput, recalc, mergeCells } from './sheetModel'
import { workbookFromBytes, workbookToBytes } from './xlsx'

function bytesOf(wb: XLSX.WorkBook): Uint8Array {
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
}

describe('xlsx bridge', () => {
  it('imports values, formulas (evaluated) and arabic sheet names', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['المرجع', 'الوصف', 'الكمية', 'سعر الوحدة', 'الخصم %', 'الضريبة %', 'الإجمالي'],
      ['P-001', 'حاسوب محمول', 2, 185000, 5, 19, { t: 'n', f: 'C2*D2*(1-E2/100)*(1+F2/100)' }],
      ['P-002', 'طابعة', 1, 42000.5, 0, 19, { t: 'n', f: 'C3*D3*(1-E3/100)*(1+F3/100)' }],
      ['', '', '', '', '', 'المجموع', { t: 'n', f: 'SUM(G2:G3)' }]
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'منتجات')
    const imported = workbookFromBytes(bytesOf(wb), 'x.xlsx')
    const s = imported.sheets[0]
    expect(s.name).toBe('منتجات')
    expect(cellValue(s, { col: 1, row: 1 })).toBe('حاسوب محمول')
    expect(cellValue(s, { col: 3, row: 2 })).toBe(42000.5)
    expect(s.cells['6:1'].input).toBe('=C2*D2*(1-E2/100)*(1+F2/100)')
    expect(cellValue(s, { col: 6, row: 1 })).toBeCloseTo(418285, 6)
    expect(cellValue(s, { col: 6, row: 3 })).toBeCloseTo(418285 + 49980.595, 6)
  })

  it('round-trips formulas, merges and widths through export', () => {
    let s = newSheet('Data')
    s = setCellInput(s, { col: 0, row: 0 }, '10')
    s = setCellInput(s, { col: 0, row: 1 }, '32.5')
    s = setCellInput(s, { col: 0, row: 2 }, '=SUM(A1:A2)')
    s = setCellInput(s, { col: 1, row: 0 }, 'نص عربي')
    s = mergeCells(s, { col: 1, row: 0, cols: 2, rows: 1 })
    s.colWidths[0] = 150
    s = recalc(s)
    const bytes = workbookToBytes({ sheets: [s], activeSheet: 0 }, 'xlsx')
    const back = workbookFromBytes(bytes, 'r.xlsx')
    const t = back.sheets[0]
    expect(t.name).toBe('Data')
    expect(t.cells['0:2'].input).toBe('=SUM(A1:A2)')
    expect(cellValue(t, { col: 0, row: 2 })).toBe(42.5)
    expect(cellValue(t, { col: 1, row: 0 })).toBe('نص عربي')
    expect(t.merges).toEqual([{ col: 1, row: 0, cols: 2, rows: 1 }])
    expect(t.colWidths[0]).toBe(150)
  })

  it('exports the active sheet as CSV bytes', () => {
    let s = newSheet('csv')
    s = setCellInput(s, { col: 0, row: 0 }, 'a')
    s = setCellInput(s, { col: 1, row: 0 }, '1.5')
    const text = new TextDecoder().decode(workbookToBytes({ sheets: [s], activeSheet: 0 }, 'csv'))
    expect(text.trim()).toBe('a,1.5')
  })
})
