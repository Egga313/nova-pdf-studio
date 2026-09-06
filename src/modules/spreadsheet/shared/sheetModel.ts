/**
 * نموذج المصنّف (Workbook): أوراق، خلايا (إدخال خام + قيمة محسوبة + تنسيق)، دمج، أبعاد الأعمدة/الصفوف،
 * إعادة حساب تعتمد على رسم التبعيات مع كشف الدورات، وتاريخ تراجع/إعادة. نقي وقابل للاختبار.
 */
import { type CellRef, type CellValue, evaluate, FormulaError, isFormula, parseFormula, refKey, referencedCells } from './formula'

export type NumberFormat = 'general' | 'number' | 'currency' | 'percent' | 'date' | 'text'
export type HAlign = 'start' | 'center' | 'end'

export interface CellStyle {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  align?: HAlign
  fontSize?: number
  color?: string
  background?: string
  border?: boolean
  format?: NumberFormat
  decimals?: number
  currency?: string
}

export interface Cell {
  input: string            // ما كتبه المستخدم (قد يبدأ بـ =)
  value: CellValue         // القيمة المحسوبة
  style?: CellStyle
}

export interface Merge {
  col: number
  row: number
  cols: number
  rows: number
}

export interface Sheet {
  id: string
  name: string
  cells: Record<string, Cell>     // المفتاح col:row
  colWidths: Record<number, number>
  rowHeights: Record<number, number>
  merges: Merge[]
  rowCount: number
  colCount: number
}

export interface Workbook {
  sheets: Sheet[]
  activeSheet: number
}

export const DEFAULT_COL_WIDTH = 110
export const DEFAULT_ROW_HEIGHT = 26
export const MIN_ROWS = 100
export const MIN_COLS = 26

let seq = 0
export function newSheet(name: string, rows = MIN_ROWS, cols = MIN_COLS): Sheet {
  return { id: `s-${Date.now().toString(36)}-${(seq++).toString(36)}`, name, cells: {}, colWidths: {}, rowHeights: {}, merges: [], rowCount: rows, colCount: cols }
}

export function newWorkbook(firstName = 'Sheet1'): Workbook {
  return { sheets: [newSheet(firstName)], activeSheet: 0 }
}

// ------------------------------------------------------------------ قراءة/كتابة الخلايا
export function getCell(sheet: Sheet, ref: CellRef): Cell | undefined {
  return sheet.cells[refKey(ref)]
}

export function cellValue(sheet: Sheet, ref: CellRef): CellValue {
  return sheet.cells[refKey(ref)]?.value ?? null
}

/** يحوّل إدخال المستخدم إلى قيمة: رقم، منطقي، نص، أو صيغة (تُحسب لاحقًا). */
export function parseInput(input: string): CellValue {
  const s = input.trim()
  if (s === '') return null
  if (isFormula(s)) return null
  const upper = s.toUpperCase()
  if (upper === 'TRUE') return true
  if (upper === 'FALSE') return false
  const normalized = s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\s/g, '')
  if (/^-?\d{1,3}(,\d{3})*(\.\d+)?$/.test(normalized) || /^-?\d+(\.\d+)?$/.test(normalized)) return Number(normalized.replace(/,/g, ''))
  if (/^-?\d+,\d+$/.test(normalized)) return Number(normalized.replace(',', '.'))
  if (/^-?\d+(\.\d+)?%$/.test(normalized)) return Number(normalized.slice(0, -1)) / 100
  return s
}

/** يكتب خلية ويعيد ورقة جديدة (بلا إعادة حساب؛ استخدم recalc بعد مجموعة تعديلات). */
export function setCellInput(sheet: Sheet, ref: CellRef, input: string): Sheet {
  const key = refKey(ref)
  const cells = { ...sheet.cells }
  const existing = cells[key]
  if (input.trim() === '' && !existing?.style) delete cells[key]
  else cells[key] = { input, value: isFormula(input) ? existing?.value ?? null : parseInput(input), style: existing?.style }
  return { ...sheet, cells, rowCount: Math.max(sheet.rowCount, ref.row + 1), colCount: Math.max(sheet.colCount, ref.col + 1) }
}

export function setCellStyle(sheet: Sheet, refs: CellRef[], patch: Partial<CellStyle>): Sheet {
  const cells = { ...sheet.cells }
  for (const ref of refs) {
    const key = refKey(ref)
    const existing = cells[key] ?? { input: '', value: null }
    cells[key] = { ...existing, style: { ...(existing.style ?? {}), ...patch } }
  }
  return { ...sheet, cells }
}

// ------------------------------------------------------------------ إعادة الحساب
/** يعيد حساب كل الصيغ بترتيب التبعيات؛ الدورات تُعلَّم #CYCLE!. */
export function recalc(sheet: Sheet): Sheet {
  const formulas = Object.entries(sheet.cells).filter(([, c]) => isFormula(c.input))
  if (!formulas.length) return sheet
  const parsed = new Map<string, ReturnType<typeof parseFormula> | FormulaError>()
  const deps = new Map<string, string[]>()
  for (const [key, cell] of formulas) {
    try {
      const node = parseFormula(cell.input)
      parsed.set(key, node)
      deps.set(key, referencedCells(node).map(refKey))
    } catch (e) {
      parsed.set(key, e instanceof FormulaError ? e : new FormulaError('#VALUE!'))
      deps.set(key, [])
    }
  }
  const values = new Map<string, CellValue>()
  const state = new Map<string, 'visiting' | 'done'>()
  const cells = { ...sheet.cells }

  const compute = (key: string): CellValue => {
    if (state.get(key) === 'done') return values.get(key) ?? null
    if (state.get(key) === 'visiting') throw new FormulaError('#CYCLE!')
    const node = parsed.get(key)
    if (!node) return cells[key]?.value ?? null // خلية عادية
    state.set(key, 'visiting')
    let result: CellValue
    if (node instanceof FormulaError) result = node.code
    else {
      try {
        result = evaluate(node, (ref) => {
          const k = refKey(ref)
          if (parsed.has(k)) return compute(k)
          return cells[k]?.value ?? null
        })
      } catch (e) {
        result = e instanceof FormulaError ? e.code : '#VALUE!'
      }
    }
    state.set(key, 'done')
    values.set(key, result)
    return result
  }

  for (const [key] of formulas) {
    try {
      compute(key)
    } catch (e) {
      values.set(key, e instanceof FormulaError ? e.code : '#VALUE!')
      state.set(key, 'done')
    }
  }
  for (const [key, value] of values) cells[key] = { ...cells[key], value }
  return { ...sheet, cells }
}

// ------------------------------------------------------------------ صفوف وأعمدة
function shiftKey(key: string, dCol: number, dRow: number): string {
  const [c, r] = key.split(':').map(Number)
  return `${c + dCol}:${r + dRow}`
}

/** يحرّك المراجع داخل الصيغ عند إدراج/حذف صفوف أو أعمدة. */
function shiftFormula(input: string, axis: 'row' | 'col', at: number, delta: number): string {
  return input.replace(/(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})(?![A-Za-z0-9_(])/g, (m, d1, letters, d2, digits) => {
    const col = letters.toUpperCase().split('').reduce((n: number, ch: string) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
    const row = Number(digits) - 1
    if (axis === 'row') {
      if (row < at) return m
      if (delta < 0 && row < at - delta) return '#REF!'
      return `${d1}${letters}${d2}${row + delta + 1}`
    }
    if (col < at) return m
    if (delta < 0 && col < at - delta) return '#REF!'
    let n = col + delta + 1
    let s = ''
    while (n > 0) {
      const r = (n - 1) % 26
      s = String.fromCharCode(65 + r) + s
      n = Math.floor((n - 1) / 26)
    }
    return `${d1}${s}${d2}${digits}`
  })
}

export function insertRows(sheet: Sheet, at: number, count = 1): Sheet {
  return shiftSheet(sheet, 'row', at, count)
}
export function deleteRows(sheet: Sheet, at: number, count = 1): Sheet {
  return shiftSheet(sheet, 'row', at, -count)
}
export function insertCols(sheet: Sheet, at: number, count = 1): Sheet {
  return shiftSheet(sheet, 'col', at, count)
}
export function deleteCols(sheet: Sheet, at: number, count = 1): Sheet {
  return shiftSheet(sheet, 'col', at, -count)
}

function shiftSheet(sheet: Sheet, axis: 'row' | 'col', at: number, delta: number): Sheet {
  const cells: Record<string, Cell> = {}
  for (const [key, cell] of Object.entries(sheet.cells)) {
    const [c, r] = key.split(':').map(Number)
    const idx = axis === 'row' ? r : c
    if (idx >= at && delta < 0 && idx < at - delta) continue // محذوف
    const target = idx >= at ? shiftKey(key, axis === 'col' ? delta : 0, axis === 'row' ? delta : 0) : key
    cells[target] = isFormula(cell.input) ? { ...cell, input: shiftFormula(cell.input, axis, at, delta) } : cell
  }
  const sizes = axis === 'row' ? sheet.rowHeights : sheet.colWidths
  const shifted: Record<number, number> = {}
  for (const [k, v] of Object.entries(sizes)) {
    const i = Number(k)
    if (i >= at && delta < 0 && i < at - delta) continue
    shifted[i >= at ? i + delta : i] = v
  }
  const merges = sheet.merges
    .filter((m) => !(delta < 0 && (axis === 'row' ? m.row : m.col) >= at && (axis === 'row' ? m.row : m.col) < at - delta))
    .map((m) => ((axis === 'row' ? m.row : m.col) >= at ? { ...m, [axis]: (axis === 'row' ? m.row : m.col) + delta } : m))
  return recalc({
    ...sheet, cells, merges,
    rowHeights: axis === 'row' ? shifted : sheet.rowHeights,
    colWidths: axis === 'col' ? shifted : sheet.colWidths,
    rowCount: axis === 'row' ? Math.max(MIN_ROWS, sheet.rowCount + delta) : sheet.rowCount,
    colCount: axis === 'col' ? Math.max(MIN_COLS, sheet.colCount + delta) : sheet.colCount
  })
}

export function mergeCells(sheet: Sheet, merge: Merge): Sheet {
  if (merge.cols <= 1 && merge.rows <= 1) return sheet
  const overlaps = (m: Merge) => !(m.col + m.cols <= merge.col || merge.col + merge.cols <= m.col || m.row + m.rows <= merge.row || merge.row + merge.rows <= m.row)
  return { ...sheet, merges: [...sheet.merges.filter((m) => !overlaps(m)), merge] }
}

export function unmergeAt(sheet: Sheet, ref: CellRef): Sheet {
  return { ...sheet, merges: sheet.merges.filter((m) => !(ref.col >= m.col && ref.col < m.col + m.cols && ref.row >= m.row && ref.row < m.row + m.rows)) }
}

// ------------------------------------------------------------------ CSV / TSV
export function parseDelimited(text: string, delimiter = ','): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
      continue
    }
    if (ch === '"') quoted = true
    else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

export function toDelimited(sheet: Sheet, delimiter = ','): string {
  const lines: string[] = []
  const maxRow = Math.max(0, ...Object.keys(sheet.cells).map((k) => Number(k.split(':')[1]))) + 1
  const maxCol = Math.max(0, ...Object.keys(sheet.cells).map((k) => Number(k.split(':')[0]))) + 1
  for (let r = 0; r < maxRow; r++) {
    const cols: string[] = []
    for (let c = 0; c < maxCol; c++) {
      const v = sheet.cells[`${c}:${r}`]?.value
      const s = v === null || v === undefined ? '' : String(v)
      cols.push(/[",\n\r\t;]/.test(s) || s.includes(delimiter) ? `"${s.replace(/"/g, '""')}"` : s)
    }
    lines.push(cols.join(delimiter))
  }
  return lines.join('\n')
}

/** يلصق مصفوفة قيم بدءًا من خلية. */
export function pasteMatrix(sheet: Sheet, at: CellRef, matrix: string[][]): Sheet {
  let s = sheet
  matrix.forEach((row, r) => row.forEach((val, c) => {
    s = setCellInput(s, { col: at.col + c, row: at.row + r }, val)
  }))
  return recalc(s)
}

export function sheetFromMatrix(name: string, matrix: (string | number | null)[][]): Sheet {
  let s = newSheet(name, Math.max(MIN_ROWS, matrix.length + 20), Math.max(MIN_COLS, ...matrix.map((r) => r.length)))
  matrix.forEach((row, r) => row.forEach((val, c) => {
    if (val !== null && val !== undefined && val !== '') s = setCellInput(s, { col: c, row: r }, String(val))
  }))
  return recalc(s)
}

// ------------------------------------------------------------------ التاريخ
export interface History<T> { past: T[]; present: T; future: T[] }
export const HISTORY_LIMIT = 200
export function pushHistory<T>(h: History<T>, next: T): History<T> {
  return { past: [...h.past.slice(-(HISTORY_LIMIT - 1)), h.present], present: next, future: [] }
}
export function undoHistory<T>(h: History<T>): History<T> {
  const prev = h.past[h.past.length - 1]
  return prev === undefined ? h : { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] }
}
export function redoHistory<T>(h: History<T>): History<T> {
  const next = h.future[0]
  return next === undefined ? h : { past: [...h.past, h.present], present: next, future: h.future.slice(1) }
}

// ------------------------------------------------------------------ تنسيق العرض
export function formatCellValue(cell: Cell | undefined, locale = 'en', currency = 'DZD'): string {
  if (!cell) return ''
  const v = cell.value
  if (v === null || v === undefined) return isFormula(cell.input) ? '' : cell.input
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'string') return v
  const st = cell.style ?? {}
  const decimals = st.decimals ?? (st.format === 'number' || st.format === 'currency' ? 2 : undefined)
  const nf = (opts: Intl.NumberFormatOptions) => new Intl.NumberFormat(`${locale}-u-nu-latn`, opts).format(v)
  switch (st.format) {
    case 'percent': return nf({ style: 'percent', minimumFractionDigits: decimals ?? 0, maximumFractionDigits: decimals ?? 2 })
    case 'currency': return nf({ minimumFractionDigits: decimals ?? 2, maximumFractionDigits: decimals ?? 2 }) + ` ${st.currency ?? currency}`
    case 'number': return nf({ minimumFractionDigits: decimals ?? 2, maximumFractionDigits: decimals ?? 2 })
    case 'date': {
      const d = new Date((v - 25569) * 86400 * 1000)
      return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : String(v)
    }
    case 'text': return cell.input
    default: return nf({ maximumFractionDigits: 10 })
  }
}
