/**
 * مخزن المصنّف داخل تبويب الجداول: الحالة الحالية + تاريخ تراجع/إعادة + التحديد + وضع التحرير.
 * كل تعديل يمرّ عبر commit() الذي يعيد الحساب ويسجّل في التاريخ ويعلّم التبويب متغيّرًا.
 */
import { createStore, type StoreApi, useStore } from 'zustand'
import { type CellRef, isFormula, refKey } from '../shared/formula'
import {
  type CellStyle, deleteCols as modelDeleteCols, deleteRows as modelDeleteRows, HISTORY_LIMIT, insertCols as modelInsertCols, insertRows as modelInsertRows,
  mergeCells, newSheet, newWorkbook, parseDelimited, pasteMatrix, recalc, setCellInput as modelSetCellInput, setCellStyle, type Sheet, toDelimited,
  unmergeAt, type Workbook, formatCellValue, MIN_ROWS
} from '../shared/sheetModel'

export interface Range { c0: number; r0: number; c1: number; r1: number }

export interface WorkbookMeta {
  title: string
  recordId: number | null
  filePath: string | null
}

export interface WorkbookState extends WorkbookMeta {
  wb: Workbook
  past: Workbook[]
  future: Workbook[]
  anchor: CellRef
  focus: CellRef
  editing: string | null          // نص التحرير الحالي للخلية النشطة (anchor)
  dirty: boolean
  copied: { inputs: string[][]; tsv: string; cut: Range | null } | null

  load: (wb: Workbook, meta: Partial<WorkbookMeta>) => void
  setTitle: (title: string) => void
  markSaved: (meta: Partial<WorkbookMeta>) => void
  setActiveSheet: (index: number) => void
  select: (anchor: CellRef, focus?: CellRef) => void
  moveFocus: (dc: number, dr: number, extend: boolean) => void
  startEdit: (initial?: string) => void
  updateEdit: (value: string) => void
  commitEdit: (move?: 'down' | 'right' | 'none') => void
  cancelEdit: () => void
  setCellInput: (ref: CellRef, input: string) => void
  applyStyle: (patch: Partial<CellStyle>) => void
  toggleStyle: (key: 'bold' | 'italic' | 'underline') => void
  insertRows: (at: number, count?: number) => void
  deleteRows: (at: number, count?: number) => void
  insertCols: (at: number, count?: number) => void
  deleteCols: (at: number, count?: number) => void
  merge: () => void
  unmerge: () => void
  clearSelection: () => void
  copy: (cut?: boolean) => string
  paste: (text: string) => void
  undo: () => void
  redo: () => void
  addSheet: () => void
  renameSheet: (index: number, name: string) => void
  deleteSheet: (index: number) => void
  setColWidth: (col: number, width: number) => void
  setRowHeight: (row: number, height: number) => void
  selectAll: () => void
}

export const sheetOf = (s: Pick<WorkbookState, 'wb'>): Sheet => s.wb.sheets[s.wb.activeSheet] ?? s.wb.sheets[0]

export function selRange(a: CellRef, f: CellRef): Range {
  return { c0: Math.min(a.col, f.col), r0: Math.min(a.row, f.row), c1: Math.max(a.col, f.col), r1: Math.max(a.row, f.row) }
}

/** يوسّع نطاق التحديد ليشمل أي خلايا مدمجة تتقاطع معه (كسلوك Excel). */
export function expandToMerges(sheet: Sheet, r: Range): Range {
  let out = { ...r }
  let changed = true
  while (changed) {
    changed = false
    for (const m of sheet.merges) {
      const mc1 = m.col + m.cols - 1
      const mr1 = m.row + m.rows - 1
      const intersects = !(mc1 < out.c0 || m.col > out.c1 || mr1 < out.r0 || m.row > out.r1)
      if (!intersects) continue
      const next = { c0: Math.min(out.c0, m.col), r0: Math.min(out.r0, m.row), c1: Math.max(out.c1, mc1), r1: Math.max(out.r1, mr1) }
      if (next.c0 !== out.c0 || next.r0 !== out.r0 || next.c1 !== out.c1 || next.r1 !== out.r1) {
        out = next
        changed = true
      }
    }
  }
  return out
}

function replaceSheet(wb: Workbook, sheet: Sheet, index = wb.activeSheet): Workbook {
  return { ...wb, sheets: wb.sheets.map((s, i) => (i === index ? sheet : s)) }
}

function cellsIn(range: Range): CellRef[] {
  const out: CellRef[] = []
  for (let r = range.r0; r <= range.r1; r++) for (let c = range.c0; c <= range.c1; c++) out.push({ col: c, row: r })
  return out
}

export function createWorkbookStore(initial?: Partial<WorkbookMeta>): StoreApi<WorkbookState> {
  return createStore<WorkbookState>((set, get) => {
    const commit = (wb: Workbook, extra: Partial<WorkbookState> = {}) => {
      const { past, wb: current } = get()
      set({ wb, past: [...past.slice(-(HISTORY_LIMIT - 1)), current], future: [], dirty: true, ...extra })
    }
    const commitSheet = (sheet: Sheet, extra: Partial<WorkbookState> = {}) => commit(replaceSheet(get().wb, recalc(sheet)), extra)
    const range = () => expandToMerges(sheetOf(get()), selRange(get().anchor, get().focus))

    return {
      wb: newWorkbook(),
      past: [],
      future: [],
      anchor: { col: 0, row: 0 },
      focus: { col: 0, row: 0 },
      editing: null,
      dirty: false,
      copied: null,
      title: initial?.title ?? '',
      recordId: initial?.recordId ?? null,
      filePath: initial?.filePath ?? null,

      load: (wb, meta) => set({ wb: { ...wb, sheets: wb.sheets.map(recalc) }, past: [], future: [], dirty: false, editing: null, anchor: { col: 0, row: 0 }, focus: { col: 0, row: 0 }, ...meta }),
      setTitle: (title) => set({ title, dirty: true }),
      markSaved: (meta) => set({ dirty: false, ...meta }),
      setActiveSheet: (index) => set({ wb: { ...get().wb, activeSheet: index }, editing: null, anchor: { col: 0, row: 0 }, focus: { col: 0, row: 0 } }),

      select: (anchor, focus) => {
        const sheet = sheetOf(get())
        let grow: Sheet | null = null
        const f = focus ?? anchor
        if (f.row >= sheet.rowCount - 3 || anchor.row >= sheet.rowCount - 3) grow = { ...sheet, rowCount: sheet.rowCount + 50 }
        if (f.col >= sheet.colCount - 2 || anchor.col >= sheet.colCount - 2) grow = { ...(grow ?? sheet), colCount: sheet.colCount + 10 }
        set({ anchor, focus: f, editing: null, ...(grow ? { wb: replaceSheet(get().wb, grow) } : {}) })
      },
      moveFocus: (dc, dr, extend) => {
        const { anchor, focus } = get()
        const base = extend ? focus : anchor
        const next = { col: Math.max(0, base.col + dc), row: Math.max(0, base.row + dr) }
        get().select(extend ? anchor : next, next)
      },
      selectAll: () => {
        const sheet = sheetOf(get())
        const keys = Object.keys(sheet.cells)
        const maxC = Math.max(0, ...keys.map((k) => Number(k.split(':')[0])))
        const maxR = Math.max(0, ...keys.map((k) => Number(k.split(':')[1])))
        set({ anchor: { col: 0, row: 0 }, focus: { col: maxC, row: maxR }, editing: null })
      },

      startEdit: (initialText) => {
        const { anchor } = get()
        const cell = sheetOf(get()).cells[refKey(anchor)]
        set({ editing: initialText ?? cell?.input ?? '' })
      },
      updateEdit: (value) => set({ editing: value }),
      commitEdit: (move = 'none') => {
        const { editing, anchor } = get()
        if (editing === null) return
        const sheet = sheetOf(get())
        const current = sheet.cells[refKey(anchor)]?.input ?? ''
        if (editing !== current) commitSheet(modelSetCellInput(sheet, anchor, editing), { editing: null })
        else set({ editing: null })
        if (move === 'down') get().moveFocus(0, 1, false)
        if (move === 'right') get().moveFocus(1, 0, false)
      },
      cancelEdit: () => set({ editing: null }),
      setCellInput: (ref, input) => commitSheet(modelSetCellInput(sheetOf(get()), ref, input)),

      applyStyle: (patch) => commitSheet(setCellStyle(sheetOf(get()), cellsIn(range()), patch)),
      toggleStyle: (key) => {
        const sheet = sheetOf(get())
        const on = !sheet.cells[refKey(get().anchor)]?.style?.[key]
        commitSheet(setCellStyle(sheet, cellsIn(range()), { [key]: on }))
      },

      insertRows: (at, count = 1) => commit(replaceSheet(get().wb, modelInsertRows(sheetOf(get()), at, count))),
      deleteRows: (at, count = 1) => commit(replaceSheet(get().wb, modelDeleteRows(sheetOf(get()), at, count)), { anchor: { col: get().anchor.col, row: at }, focus: { col: get().anchor.col, row: at } }),
      insertCols: (at, count = 1) => commit(replaceSheet(get().wb, modelInsertCols(sheetOf(get()), at, count))),
      deleteCols: (at, count = 1) => commit(replaceSheet(get().wb, modelDeleteCols(sheetOf(get()), at, count)), { anchor: { col: at, row: get().anchor.row }, focus: { col: at, row: get().anchor.row } }),

      merge: () => {
        const r = range()
        if (r.c0 === r.c1 && r.r0 === r.r1) return
        commitSheet(mergeCells(sheetOf(get()), { col: r.c0, row: r.r0, cols: r.c1 - r.c0 + 1, rows: r.r1 - r.r0 + 1 }), { anchor: { col: r.c0, row: r.r0 }, focus: { col: r.c0, row: r.r0 } })
      },
      unmerge: () => commitSheet(unmergeAt(sheetOf(get()), get().anchor)),

      clearSelection: () => {
        let sheet = sheetOf(get())
        for (const ref of cellsIn(range())) sheet = modelSetCellInput(sheet, ref, '')
        commitSheet(sheet)
      },

      copy: (cut = false) => {
        const r = range()
        const sheet = sheetOf(get())
        const inputs: string[][] = []
        const lines: string[] = []
        for (let row = r.r0; row <= r.r1; row++) {
          const ins: string[] = []
          const vals: string[] = []
          for (let col = r.c0; col <= r.c1; col++) {
            const cell = sheet.cells[`${col}:${row}`]
            ins.push(cell?.input ?? '')
            vals.push(formatCellValue(cell))
          }
          inputs.push(ins)
          lines.push(vals.join('\t'))
        }
        const tsv = lines.join('\n')
        set({ copied: { inputs, tsv, cut: cut ? r : null } })
        return tsv
      },
      paste: (text) => {
        const { copied, anchor } = get()
        let sheet = sheetOf(get())
        if (copied && text === copied.tsv) {
          if (copied.cut) for (const ref of cellsIn(copied.cut)) sheet = modelSetCellInput(sheet, ref, '')
          sheet = pasteMatrix(sheet, anchor, copied.inputs)
          if (copied.cut) set({ copied: { ...copied, cut: null } })
        } else {
          const matrix = parseDelimited(text.replace(/\r\n?/g, '\n').replace(/\n$/, ''), '\t')
          sheet = pasteMatrix(sheet, anchor, matrix)
        }
        const rows = copied && text === copied.tsv ? copied.inputs.length : text.split('\n').length
        const cols = copied && text === copied.tsv ? copied.inputs[0]?.length ?? 1 : (text.split('\n')[0] ?? '').split('\t').length
        commitSheet(sheet, { focus: { col: anchor.col + cols - 1, row: anchor.row + rows - 1 } })
      },

      undo: () => {
        const { past, wb, future } = get()
        const prev = past[past.length - 1]
        if (!prev) return
        set({ wb: prev, past: past.slice(0, -1), future: [wb, ...future], dirty: true, editing: null })
      },
      redo: () => {
        const { past, wb, future } = get()
        const next = future[0]
        if (!next) return
        set({ wb: next, past: [...past, wb], future: future.slice(1), dirty: true, editing: null })
      },

      addSheet: () => {
        const wb = get().wb
        const name = `Sheet${wb.sheets.length + 1}`
        commit({ ...wb, sheets: [...wb.sheets, newSheet(name, MIN_ROWS)], activeSheet: wb.sheets.length }, { anchor: { col: 0, row: 0 }, focus: { col: 0, row: 0 } })
      },
      renameSheet: (index, name) => {
        const wb = get().wb
        const clean = name.trim().slice(0, 31)
        if (!clean) return
        commit({ ...wb, sheets: wb.sheets.map((s, i) => (i === index ? { ...s, name: clean } : s)) })
      },
      deleteSheet: (index) => {
        const wb = get().wb
        if (wb.sheets.length <= 1) return
        const sheets = wb.sheets.filter((_, i) => i !== index)
        commit({ sheets, activeSheet: Math.min(wb.activeSheet, sheets.length - 1) }, { anchor: { col: 0, row: 0 }, focus: { col: 0, row: 0 } })
      },
      setColWidth: (col, width) => {
        const sheet = sheetOf(get())
        commit(replaceSheet(get().wb, { ...sheet, colWidths: { ...sheet.colWidths, [col]: Math.max(28, Math.round(width)) } }))
      },
      setRowHeight: (row, height) => {
        const sheet = sheetOf(get())
        commit(replaceSheet(get().wb, { ...sheet, rowHeights: { ...sheet.rowHeights, [row]: Math.max(18, Math.round(height)) } }))
      }
    }
  })
}

export function useWorkbook<T>(store: StoreApi<WorkbookState>, selector: (s: WorkbookState) => T): T {
  return useStore(store, selector)
}

/** إحصاءات التحديد لشريط الحالة. */
export function selectionStats(sheet: Sheet, r: Range): { count: number; sum: number; avg: number | null; cells: number } {
  let count = 0
  let sum = 0
  for (let row = r.r0; row <= r.r1; row++) {
    for (let col = r.c0; col <= r.c1; col++) {
      const v = sheet.cells[`${col}:${row}`]?.value
      if (typeof v === 'number') {
        count++
        sum += v
      }
    }
  }
  return { count, sum, avg: count ? sum / count : null, cells: (r.r1 - r.r0 + 1) * (r.c1 - r.c0 + 1) }
}

export { toDelimited, isFormula }
