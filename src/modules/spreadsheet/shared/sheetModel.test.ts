import { describe, expect, it } from 'vitest'
import {
  cellValue, deleteRows, insertCols, insertRows, mergeCells, newSheet, parseDelimited, parseInput, pasteMatrix,
  pushHistory, recalc, redoHistory, setCellInput, sheetFromMatrix, toDelimited, undoHistory, formatCellValue, type History
} from './sheetModel'

const A = (col: number, row: number) => ({ col, row })

describe('parseInput', () => {
  it('detects numbers, booleans, percents, arabic digits and text', () => {
    expect(parseInput('1050.50')).toBe(1050.5)
    expect(parseInput('1,050.50')).toBe(1050.5)
    expect(parseInput('١٢٣')).toBe(123)
    expect(parseInput('12,5')).toBe(12.5)
    expect(parseInput('19%')).toBe(0.19)
    expect(parseInput('true')).toBe(true)
    expect(parseInput('hello')).toBe('hello')
    expect(parseInput('  ')).toBeNull()
    expect(parseInput('=1+1')).toBeNull()
  })
})

describe('recalc', () => {
  it('evaluates chained formulas regardless of insertion order', () => {
    let s = newSheet('t')
    s = setCellInput(s, A(2, 0), '=B1*2')     // C1 depends on B1
    s = setCellInput(s, A(1, 0), '=A1+1')     // B1 depends on A1
    s = setCellInput(s, A(0, 0), '10')
    s = recalc(s)
    expect(cellValue(s, A(1, 0))).toBe(11)
    expect(cellValue(s, A(2, 0))).toBe(22)
  })
  it('flags cycles', () => {
    let s = newSheet('t')
    s = setCellInput(s, A(0, 0), '=B1')
    s = setCellInput(s, A(1, 0), '=A1')
    s = recalc(s)
    expect(cellValue(s, A(0, 0))).toBe('#CYCLE!')
    expect(cellValue(s, A(1, 0))).toBe('#CYCLE!')
  })
  it('sums ranges with blanks and text like an invoice grid', () => {
    const s = sheetFromMatrix('inv', [
      ['Item', 'Qty', 'Price', 'Total'],
      ['A', 3, 1050.5, '=B2*C2'],
      ['B', 2, 200, '=B3*C3'],
      ['', '', 'Sum', '=SUM(D2:D3)']
    ])
    expect(cellValue(s, A(3, 1))).toBe(3151.5)
    expect(cellValue(s, A(3, 3))).toBe(3551.5)
  })
})

describe('rows and columns', () => {
  it('shifts cells and formula references on insert/delete', () => {
    let s = sheetFromMatrix('t', [[1], [2], ['=A1+A2']])
    s = insertRows(s, 1)
    expect(cellValue(s, A(0, 1))).toBeNull()
    expect(s.cells['0:3'].input).toBe('=A1+A3')
    expect(cellValue(s, A(0, 3))).toBe(3)
    s = deleteRows(s, 0)
    expect(s.cells['0:2'].input).toBe('=#REF!+A2')
    expect(cellValue(s, A(0, 2))).toBe('#REF!')
  })
  it('shifts columns', () => {
    let s = sheetFromMatrix('t', [[1, 2, '=A1+B1']])
    s = insertCols(s, 1)
    expect(s.cells['3:0'].input).toBe('=A1+C1')
    expect(cellValue(s, A(3, 0))).toBe(3)
  })
  it('merges without overlap', () => {
    let s = newSheet('t')
    s = mergeCells(s, { col: 0, row: 0, cols: 2, rows: 1 })
    s = mergeCells(s, { col: 1, row: 0, cols: 2, rows: 2 })
    expect(s.merges).toHaveLength(1)
    expect(s.merges[0].cols).toBe(2)
  })
})

describe('csv', () => {
  it('parses quoted fields and line endings', () => {
    expect(parseDelimited('a,"b,c","d""e"\r\n1,2,3\n')).toEqual([['a', 'b,c', 'd"e'], ['1', '2', '3']])
    expect(parseDelimited('x\ty', '\t')).toEqual([['x', 'y']])
  })
  it('round-trips through toDelimited and pasteMatrix', () => {
    const s = pasteMatrix(newSheet('t'), A(0, 0), [['name', 'qty'], ['قلم, أزرق', '5']])
    const csv = toDelimited(s)
    expect(csv).toBe('name,qty\n"قلم, أزرق",5')
    expect(parseDelimited(csv)[1][0]).toBe('قلم, أزرق')
  })
})

describe('history & formatting', () => {
  it('undo/redo', () => {
    let h: History<number> = { past: [], present: 1, future: [] }
    h = pushHistory(h, 2)
    h = pushHistory(h, 3)
    h = undoHistory(h)
    expect(h.present).toBe(2)
    h = redoHistory(h)
    expect(h.present).toBe(3)
    expect(undoHistory(undoHistory(undoHistory(h))).present).toBe(1)
  })
  it('formats by style', () => {
    expect(formatCellValue({ input: '1234.5', value: 1234.5, style: { format: 'number' } })).toBe('1,234.50')
    expect(formatCellValue({ input: '0.19', value: 0.19, style: { format: 'percent' } })).toBe('19%')
    expect(formatCellValue({ input: '5', value: 5, style: { format: 'currency', currency: 'DZD' } })).toBe('5.00 DZD')
    expect(formatCellValue({ input: '=1/0', value: '#DIV/0!' })).toBe('#DIV/0!')
  })
})
