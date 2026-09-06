/**
 * جسر SheetJS: استيراد xlsx/xls/csv إلى Workbook وتصديره. لا يعتمد على DOM فيعمل في main والمعالج.
 */
import * as XLSX from 'xlsx'
import { type CellValue, evaluateFormula, isFormula } from './formula'
import { DEFAULT_COL_WIDTH, MIN_COLS, MIN_ROWS, newSheet, recalc, type Sheet, type Workbook } from './sheetModel'

const CHAR_PX = 7

export function workbookFromBytes(bytes: Uint8Array, fileName = ''): Workbook {
  const isCsv = /\.(csv|txt|tsv)$/i.test(fileName)
  // cellStyles مطلوب في SheetJS لقراءة عروض الأعمدة، وكذلك لإرجاع خلايا الصيغ التي لا تحمل قيمة مخبأة
  const wb = XLSX.read(bytes, { type: 'array', cellFormula: true, cellStyles: true, cellDates: false, raw: isCsv ? false : undefined, codepage: 65001 })
  const sheets: Sheet[] = wb.SheetNames.map((name) => sheetFromWorksheet(name, wb.Sheets[name]))
  return { sheets: sheets.length ? sheets : [newSheet('Sheet1')], activeSheet: 0 }
}

function sheetFromWorksheet(name: string, ws: XLSX.WorkSheet): Sheet {
  const ref = ws['!ref']
  const range = ref ? XLSX.utils.decode_range(ref) : { s: { c: 0, r: 0 }, e: { c: -1, r: -1 } }
  const sheet = newSheet(name, Math.max(MIN_ROWS, range.e.r + 21), Math.max(MIN_COLS, range.e.c + 3))
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ c, r })] as XLSX.CellObject | undefined
      if (!cell) continue
      let input = ''
      if (cell.f) input = `=${cell.f}`
      else if (cell.t === 'n') input = String(cell.v ?? '')
      else if (cell.t === 'b') input = cell.v ? 'TRUE' : 'FALSE'
      else if (cell.t === 'd' && cell.v instanceof Date) input = cell.v.toISOString().slice(0, 10)
      else if (cell.t === 'e') input = String(cell.w ?? '#VALUE!')
      else input = cell.v === undefined || cell.v === null ? '' : String(cell.v)
      if (input === '') continue
      const value = cell.f ? null : cell.t === 'n' ? Number(cell.v) : cell.t === 'b' ? Boolean(cell.v) : input
      sheet.cells[`${c}:${r}`] = { input, value }
      const style = cell.z && typeof cell.z === 'string' ? styleFromFormat(cell.z) : undefined
      if (style) sheet.cells[`${c}:${r}`].style = style
    }
  }
  ws['!cols']?.forEach((col, i) => {
    if (!col) return
    if (col.wpx) sheet.colWidths[i] = Math.round(col.wpx)
    else if (col.wch) sheet.colWidths[i] = Math.round(col.wch * CHAR_PX + 5)
    else if (col.width) sheet.colWidths[i] = Math.round(col.width * CHAR_PX + 5)
  })
  // صيغة بدالة لا يدعمها المحرك: نحتفظ بالقيمة المخبأة من Excel كقيمة عادية بدل إظهار #NAME?
  const raw = (ref: { col: number; row: number }): CellValue => sheet.cells[`${ref.col}:${ref.row}`]?.value ?? null
  for (const [key, cell] of Object.entries(sheet.cells)) {
    if (!isFormula(cell.input)) continue
    if (evaluateFormula(cell.input, raw) !== '#NAME?') continue
    const addr = key.split(':').map(Number)
    const original = ws[XLSX.utils.encode_cell({ c: addr[0], r: addr[1] })] as XLSX.CellObject | undefined
    if (original && original.v !== undefined && original.v !== null) {
      const v = original.t === 'n' ? Number(original.v) : original.t === 'b' ? Boolean(original.v) : String(original.v)
      sheet.cells[key] = { ...cell, input: String(v), value: v }
    }
  }
  ws['!rows']?.forEach((row, i) => {
    if (row?.hpx) sheet.rowHeights[i] = Math.round(row.hpx)
  })
  ws['!merges']?.forEach((m) => sheet.merges.push({ col: m.s.c, row: m.s.r, cols: m.e.c - m.s.c + 1, rows: m.e.r - m.s.r + 1 }))
  return recalc(sheet)
}

function styleFromFormat(z: string): Sheet['cells'][string]['style'] | undefined {
  if (z.includes('%')) return { format: 'percent' }
  if (/yy|dd|mm/i.test(z) && !z.includes('#')) return { format: 'date' }
  if (/0\.00/.test(z)) return { format: 'number', decimals: 2 }
  if (z === '@') return { format: 'text' }
  return undefined
}

export function workbookToBytes(wb: Workbook, bookType: 'xlsx' | 'csv' = 'xlsx'): Uint8Array {
  const out = XLSX.utils.book_new()
  const sheets = bookType === 'csv' ? [wb.sheets[wb.activeSheet] ?? wb.sheets[0]] : wb.sheets
  for (const sheet of sheets) {
    const ws: XLSX.WorkSheet = {}
    let maxC = -1
    let maxR = -1
    for (const [key, cell] of Object.entries(sheet.cells)) {
      const [c, r] = key.split(':').map(Number)
      if (cell.input === '' && !cell.style) continue
      maxC = Math.max(maxC, c)
      maxR = Math.max(maxR, r)
      const addr = XLSX.utils.encode_cell({ c, r })
      const v = cell.value
      const xc: XLSX.CellObject = typeof v === 'number' ? { t: 'n', v } : typeof v === 'boolean' ? { t: 'b', v } : { t: 's', v: v === null ? '' : String(v) }
      if (isFormula(cell.input)) xc.f = cell.input.slice(1)
      if (cell.style?.format === 'percent') xc.z = '0.00%'
      else if (cell.style?.format === 'number' || cell.style?.format === 'currency') xc.z = '#,##0.00'
      ws[addr] = xc
    }
    ws['!ref'] = XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: Math.max(0, maxC), r: Math.max(0, maxR) } })
    const cols: XLSX.ColInfo[] = []
    for (let c = 0; c <= maxC; c++) cols.push({ wpx: sheet.colWidths[c] ?? DEFAULT_COL_WIDTH })
    ws['!cols'] = cols
    ws['!merges'] = sheet.merges.map((m) => ({ s: { c: m.col, r: m.row }, e: { c: m.col + m.cols - 1, r: m.row + m.rows - 1 } }))
    XLSX.utils.book_append_sheet(out, ws, sheet.name.slice(0, 31) || 'Sheet')
  }
  const data = XLSX.write(out, { type: 'array', bookType, compression: true }) as ArrayBuffer
  return new Uint8Array(data)
}
