import { describe, expect, it } from 'vitest'
import {
  addObject, bringToFront, canRedo, canUndo, createHistory, deserializeLayer, hexToRgb01, hitTest, isRtlText, isStandardFontSafe,
  moveObject, redo, remapPages, removeObjects, serializeLayer, undo, updateObject, type ShapeObject, type TextObject
} from './editModel'

const rect = (id: string, page = 0): ShapeObject => ({ id, page, kind: 'rect', x: 10, y: 10, width: 100, height: 50, stroke: '#000000', strokeWidth: 1, fill: null, opacity: 1 })
const text = (id: string): TextObject => ({
  id, page: 0, kind: 'text', x: 0, y: 0, width: 200, height: 20, text: 'Hello', fontSize: 12, fontFamily: 'sans', bold: false, italic: false,
  underline: false, align: 'left', color: '#000000', background: null, direction: 'auto'
})

describe('edit history', () => {
  it('adds, updates, removes with undo/redo', () => {
    let h = createHistory()
    expect(canUndo(h)).toBe(false)
    h = addObject(h, rect('a'))
    h = addObject(h, text('b'))
    expect(h.present.objects.map((o) => o.id)).toEqual(['a', 'b'])
    h = updateObject(h, 'a', { width: 300 })
    expect((h.present.objects[0] as ShapeObject).width).toBe(300)
    h = undo(h)
    expect((h.present.objects[0] as ShapeObject).width).toBe(100)
    expect(canRedo(h)).toBe(true)
    h = redo(h)
    expect((h.present.objects[0] as ShapeObject).width).toBe(300)
    h = removeObjects(h, ['a'])
    expect(h.present.objects.map((o) => o.id)).toEqual(['b'])
    h = undo(h)
    expect(h.present.objects).toHaveLength(2)
    // تعديل جديد بعد التراجع يمسح المستقبل
    h = moveObject(h, 'b', 5, 7)
    expect(canRedo(h)).toBe(false)
    expect(h.present.objects[1].x).toBe(5)
    expect(h.present.objects[1].y).toBe(7)
  })

  it('supports transient updates that do not record history (dragging)', () => {
    let h = addObject(createHistory(), rect('a'))
    const before = h.past.length
    h = moveObject(h, 'a', 1, 1, false)
    h = moveObject(h, 'a', 1, 1, false)
    expect(h.past.length).toBe(before)
    expect(h.present.objects[0].x).toBe(12)
  })

  it('reorders and hit-tests', () => {
    let h = addObject(addObject(createHistory(), rect('a')), rect('b'))
    expect(hitTest(h.present, 0, 20, 20)?.id).toBe('b') // الأعلى يفوز
    h = bringToFront(h, 'a')
    expect(hitTest(h.present, 0, 20, 20)?.id).toBe('a')
    expect(hitTest(h.present, 0, 500, 500)).toBeNull()
    expect(hitTest(h.present, 1, 20, 20)).toBeNull()
  })

  it('remaps pages after deletion', () => {
    const layer = { objects: [rect('a', 0), rect('b', 1), rect('c', 2)] }
    const remapped = remapPages(layer, (p) => (p === 1 ? null : p > 1 ? p - 1 : p))
    expect(remapped.objects.map((o) => [o.id, o.page])).toEqual([['a', 0], ['c', 1]])
  })

  it('serializes and tolerates garbage', () => {
    const layer = { objects: [rect('a')] }
    expect(deserializeLayer(serializeLayer(layer))).toEqual(layer)
    expect(deserializeLayer('{oops')).toEqual({ objects: [] })
  })
})

describe('helpers', () => {
  it('converts colors', () => {
    expect(hexToRgb01('#ff0000')).toEqual([1, 0, 0])
    expect(hexToRgb01('#000000')).toEqual([0, 0, 0])
    expect(hexToRgb01('bad')).toEqual([0, 0, 0])
  })
  it('detects rtl and standard-font safety', () => {
    expect(isRtlText('مرحبا')).toBe(true)
    expect(isRtlText('Hello')).toBe(false)
    expect(isStandardFontSafe('Invoice 1,250.00 € — ok')).toBe(true)
    expect(isStandardFontSafe('فاتورة')).toBe(false)
  })
})
