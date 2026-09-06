import { describe, expect, it } from 'vitest'
import { colToLetters, evaluateFormula, lettersToCol, parseA1, parseFormula, referencedCells, refToA1, type CellValue } from './formula'

const grid: Record<string, CellValue> = { 'A1': 10, 'A2': 20, 'A3': 30, 'B1': 'x', 'B2': 2.5, 'C1': '', 'C2': null, 'D1': 'Hello', 'D2': 'World' }
const resolve = (ref: { col: number; row: number }) => grid[refToA1(ref)] ?? null
const f = (src: string) => evaluateFormula(src, resolve)

describe('references', () => {
  it('converts columns and A1 refs', () => {
    expect(colToLetters(0)).toBe('A')
    expect(colToLetters(25)).toBe('Z')
    expect(colToLetters(26)).toBe('AA')
    expect(colToLetters(701)).toBe('ZZ')
    expect(lettersToCol('AA')).toBe(26)
    expect(parseA1('$B$7')).toEqual({ col: 1, row: 6 })
    expect(parseA1('b7')).toEqual({ col: 1, row: 6 })
    expect(parseA1('7B')).toBeNull()
    expect(refToA1({ col: 27, row: 9 })).toBe('AB10')
  })
  it('lists referenced cells including ranges', () => {
    expect(referencedCells(parseFormula('=SUM(A1:B2)+C1')).map(refToA1)).toEqual(['A1', 'A2', 'B1', 'B2', 'C1'])
  })
})

describe('evaluate', () => {
  it('arithmetic with precedence, unary and percent', () => {
    expect(f('=1+2*3')).toBe(7)
    expect(f('=(1+2)*3')).toBe(9)
    expect(f('=2^3^2')).toBe(512)
    expect(f('=-A1+5')).toBe(-5)
    expect(f('=50%')).toBe(0.5)
    expect(f('=A1*10%')).toBe(1)
    expect(f('=A1/4')).toBe(2.5)
  })
  it('functions over ranges ignore text and blanks', () => {
    expect(f('=SUM(A1:A3)')).toBe(60)
    expect(f('=SUM(A1:B2)')).toBe(32.5)
    expect(f('=AVERAGE(A1:A3)')).toBe(20)
    expect(f('=MIN(A1:A3)')).toBe(10)
    expect(f('=MAX(A1:B2)')).toBe(20)
    expect(f('=COUNT(A1:B2)')).toBe(3)
    expect(f('=COUNTA(A1:C2)')).toBe(4)
    expect(f('=SUM(A1,A2,5)')).toBe(35)
  })
  it('IF, ROUND, comparisons, text', () => {
    expect(f('=IF(A1>5,"big","small")')).toBe('big')
    expect(f('=IF(A1>50,"big","small")')).toBe('small')
    expect(f('=IF(A1=10,1,0)')).toBe(1)
    expect(f('=ROUND(1050.505,2)')).toBe(1050.51)
    expect(f('=ROUND(B2)')).toBe(3)
    expect(f('=D1&" "&D2')).toBe('Hello World')
    expect(f('=CONCAT(D1,"-",A1)')).toBe('Hello-10')
    expect(f('=LEN(D1)')).toBe(5)
    expect(f('=AND(A1>5,A2>5)')).toBe(true)
    expect(f('=NOT(A1>5)')).toBe(false)
    expect(f('=A1<>A2')).toBe(true)
  })
  it('errors follow Excel codes', () => {
    expect(f('=1/0')).toBe('#DIV/0!')
    expect(f('=AVERAGE(C1:C2)')).toBe('#DIV/0!')
    expect(f('=FOO(1)')).toBe('#NAME?')
    expect(f('=B1+1')).toBe('#VALUE!')
    expect(f('=1+')).toBe('#VALUE!')
  })
  it('accepts semicolon separators and arabic digits', () => {
    expect(f('=SUM(A1;A2)')).toBe(30)
    expect(f('=١+٢')).toBe(3)
  })
})
