import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { applyEdits } from './applyEdits'
import type { EditLayer, TextObject } from './editModel'
import { createBlank, pageCount } from './pdfTools'

// PNG 1×1 شفاف صالح
const PNG_1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

const latin: TextObject = {
  id: 't1', page: 0, kind: 'text', x: 50, y: 60, width: 300, height: 40, text: 'Hello NOVA 1,250.00 EUR', fontSize: 14, fontFamily: 'sans',
  bold: true, italic: false, underline: true, align: 'left', color: '#112233', background: '#ffffcc', direction: 'ltr'
}
const arabic: TextObject = { ...latin, id: 't2', text: 'فاتورة رقم ١', direction: 'rtl' }

describe('applyEdits', () => {
  it('bakes shapes, highlight, redact, image and latin text into the PDF', async () => {
    const base = await createBlank('A4', 'portrait', 2)
    const layer: EditLayer = {
      objects: [
        { id: 'r', page: 0, kind: 'redact', x: 40, y: 40, width: 200, height: 20, color: '#ffffff' },
        { id: 'h', page: 0, kind: 'highlight', x: 40, y: 100, width: 200, height: 16, color: '#ffff00', opacity: 0.4 },
        { id: 's', page: 1, kind: 'rect', x: 20, y: 20, width: 100, height: 60, stroke: '#ff0000', strokeWidth: 2, fill: '#00ff00', opacity: 0.8 },
        { id: 'e', page: 1, kind: 'ellipse', x: 200, y: 20, width: 80, height: 40, stroke: '#0000ff', strokeWidth: 1, fill: null, opacity: 1 },
        { id: 'l', page: 1, kind: 'line', x: 20, y: 200, width: 300, height: 0, stroke: '#000000', strokeWidth: 1.5, fill: null, opacity: 1 },
        { id: 'c', page: 1, kind: 'check', x: 20, y: 240, width: 20, height: 20, stroke: '#008800', strokeWidth: 2, fill: null, opacity: 1 },
        { id: 'i', page: 0, kind: 'image', x: 300, y: 300, width: 50, height: 50, mime: 'image/png', dataBase64: PNG_1x1, opacity: 1, role: 'signature' },
        latin,
        { id: 'skip', page: 9, kind: 'redact', x: 0, y: 0, width: 1, height: 1, color: '#000000' } // صفحة غير موجودة تُتجاهل
      ]
    }
    const out = await applyEdits(base, layer)
    expect(await pageCount(out)).toBe(2)
    expect(out.byteLength).toBeGreaterThan(base.byteLength)
    const doc = await PDFDocument.load(out)
    expect(doc.getPage(0).node.Resources()).toBeDefined()
  })

  it('requires a rasterizer for non-latin text and uses it when provided', async () => {
    const base = await createBlank('A4', 'portrait', 1)
    await expect(applyEdits(base, { objects: [arabic] })).rejects.toMatchObject({ code: 'PDF_UNSUPPORTED' })
    let called = 0
    const out = await applyEdits(base, { objects: [arabic] }, {
      rasterizeText: async () => {
        called++
        return { png: Uint8Array.from(Buffer.from(PNG_1x1, 'base64')), widthPt: 120, heightPt: 20 }
      }
    })
    expect(called).toBe(1)
    expect(await pageCount(out)).toBe(1)
  })

  it('rejects corrupted input', async () => {
    await expect(applyEdits(new Uint8Array([1, 2, 3]), { objects: [] })).rejects.toMatchObject({ code: 'PDF_CORRUPTED' })
  })
})
