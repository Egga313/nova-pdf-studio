import { describe, expect, it } from 'vitest'
import {
  addPageNumbers, addWatermark, compress, createBlank, deletePages, duplicatePage, extractPages, insertBlankPage, merge,
  pageCount, parsePageRange, reorderPages, rotatePages, split
} from './pdfTools'

async function sample(pages: number): Promise<Uint8Array> {
  return createBlank('A4', 'portrait', pages)
}

describe('parsePageRange', () => {
  it('parses lists, ranges and open ranges (1-based → 0-based)', () => {
    expect(parsePageRange('1-3, 5, 8-', 10)).toEqual([0, 1, 2, 4, 7, 8, 9])
    expect(parsePageRange('3-', 4)).toEqual([2, 3])
    expect(parsePageRange('-2', 4)).toEqual([0, 1])
    expect(parsePageRange('2, 2, 1', 4)).toEqual([0, 1])
  })
  it('rejects invalid input', () => {
    expect(() => parsePageRange('0', 4)).toThrow()
    expect(() => parsePageRange('7', 4)).toThrow()
    expect(() => parsePageRange('a-b', 4)).toThrow()
    expect(() => parsePageRange('3-1', 4)).toThrow()
  })
})

describe('pdf tools', () => {
  it('creates blank documents with paper size and orientation', async () => {
    const portrait = await sample(2)
    expect(await pageCount(portrait)).toBe(2)
    const landscape = await createBlank('A4', 'landscape')
    expect(await pageCount(landscape)).toBe(1)
  })

  it('merges, extracts and splits', async () => {
    const merged = await merge([await sample(2), await sample(3)])
    expect(await pageCount(merged)).toBe(5)
    const extracted = await extractPages(merged, [4, 0])
    expect(await pageCount(extracted)).toBe(2)
    const parts = await split(merged, { every: 2 })
    expect(parts).toHaveLength(3)
    expect(await pageCount(parts[2])).toBe(1)
    const byRanges = await split(merged, { ranges: [[0, 1, 2], [3, 4]] })
    expect(await Promise.all(byRanges.map(pageCount))).toEqual([3, 2])
  })

  it('deletes, reorders, rotates, duplicates and inserts pages', async () => {
    const doc = await sample(4)
    expect(await pageCount(await deletePages(doc, [1, 3]))).toBe(2)
    await expect(deletePages(doc, [0, 1, 2, 3])).rejects.toThrow()
    expect(await pageCount(await reorderPages(doc, [3, 2, 1, 0]))).toBe(4)
    await expect(reorderPages(doc, [0, 0, 1, 2])).rejects.toThrow()
    expect(await pageCount(await rotatePages(doc, 'all', 90))).toBe(4)
    expect(await pageCount(await duplicatePage(doc, 0))).toBe(5)
    expect(await pageCount(await insertBlankPage(doc, 2))).toBe(5)
  })

  it('adds watermark, page numbers and compresses without losing pages', async () => {
    const doc = await sample(3)
    const marked = await addWatermark(doc, { text: 'DRAFT' })
    expect(await pageCount(marked)).toBe(3)
    const numbered = await addPageNumbers(marked, { position: 'bottom-right' })
    expect(await pageCount(numbered)).toBe(3)
    const compact = await compress(numbered)
    expect(await pageCount(compact)).toBe(3)
    expect(compact.byteLength).toBeGreaterThan(100)
  })

  it('reports corrupted input as a PDF error', async () => {
    await expect(pageCount(new Uint8Array([1, 2, 3, 4]))).rejects.toMatchObject({ code: 'PDF_CORRUPTED' })
  })
})
