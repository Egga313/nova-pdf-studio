/**
 * نموذج تعديل PDF (طبقة Overlay): كائنات تُرسم فوق الصفحة الأصلية وتُدمج فيها عند الحفظ.
 * الإحداثيات كلها بوحدة النقطة من أعلى-يسار الصفحة غير المدوّرة (نفس نظام pdf.js في العارض).
 *
 * تعديل نص أصلي = كائن "redact" أبيض يغطي المقطع الأصلي + كائن "text" جديد بالخط والحجم والموضع نفسه.
 * التاريخ (undo/redo) مخزّن كلقطات كاملة للطبقة؛ عدد الكائنات صغير فالتكلفة مقبولة.
 */

export type EditObject = TextObject | ImageObject | ShapeObject | HighlightObject | RedactObject

export interface BaseObject {
  id: string
  page: number
  x: number
  y: number
  width: number
  height: number
  rotation?: number         // درجات، حول مركز الكائن
  locked?: boolean
}

export type FontFamily = 'sans' | 'serif' | 'mono'
export type TextAlign = 'left' | 'center' | 'right'

export interface TextObject extends BaseObject {
  kind: 'text'
  text: string
  fontSize: number
  fontFamily: FontFamily
  bold: boolean
  italic: boolean
  underline: boolean
  align: TextAlign
  color: string             // #rrggbb
  background: string | null
  direction: 'ltr' | 'rtl' | 'auto'
  /** يشير إلى أن الكائن يستبدل نصًا أصليًا (لأغراض العرض فقط) */
  replaces?: { spanText: string }
}

export interface ImageObject extends BaseObject {
  kind: 'image'
  mime: 'image/png' | 'image/jpeg'
  dataBase64: string
  role?: 'image' | 'signature' | 'stamp' | 'logo'
  opacity: number
}

export interface ShapeObject extends BaseObject {
  kind: 'rect' | 'ellipse' | 'line' | 'check'
  stroke: string
  strokeWidth: number
  fill: string | null
  opacity: number
}

export interface HighlightObject extends BaseObject {
  kind: 'highlight'
  color: string
  opacity: number
}

export interface RedactObject extends BaseObject {
  kind: 'redact'
  color: string             // عادة أبيض لإخفاء نص، أو أسود للتنقيح
}

export interface EditLayer {
  objects: EditObject[]
}

export interface EditHistory {
  past: EditLayer[]
  present: EditLayer
  future: EditLayer[]
}

export const EMPTY_LAYER: EditLayer = { objects: [] }
export const MAX_HISTORY = 100

let seq = 0
export function newId(prefix = 'o'): string {
  seq = (seq + 1) % 1_000_000
  return `${prefix}-${Date.now().toString(36)}-${seq.toString(36)}`
}

export function createHistory(initial: EditLayer = EMPTY_LAYER): EditHistory {
  return { past: [], present: initial, future: [] }
}

function push(history: EditHistory, next: EditLayer): EditHistory {
  return { past: [...history.past.slice(-(MAX_HISTORY - 1)), history.present], present: next, future: [] }
}

export function addObject(history: EditHistory, object: EditObject): EditHistory {
  return push(history, { objects: [...history.present.objects, object] })
}

export function updateObject(history: EditHistory, id: string, patch: Partial<EditObject>, record = true): EditHistory {
  const objects = history.present.objects.map((o) => (o.id === id ? ({ ...o, ...patch } as EditObject) : o))
  return record ? push(history, { objects }) : { ...history, present: { objects } }
}

export function removeObjects(history: EditHistory, ids: string[]): EditHistory {
  const set = new Set(ids)
  return push(history, { objects: history.present.objects.filter((o) => !set.has(o.id)) })
}

export function moveObject(history: EditHistory, id: string, dx: number, dy: number, record = true): EditHistory {
  const target = history.present.objects.find((o) => o.id === id)
  if (!target) return history
  return updateObject(history, id, { x: target.x + dx, y: target.y + dy }, record)
}

export function bringToFront(history: EditHistory, id: string): EditHistory {
  const target = history.present.objects.find((o) => o.id === id)
  if (!target) return history
  return push(history, { objects: [...history.present.objects.filter((o) => o.id !== id), target] })
}

export function undo(history: EditHistory): EditHistory {
  const previous = history.past[history.past.length - 1]
  if (!previous) return history
  return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] }
}

export function redo(history: EditHistory): EditHistory {
  const next = history.future[0]
  if (!next) return history
  return { past: [...history.past, history.present], present: next, future: history.future.slice(1) }
}

export function canUndo(history: EditHistory): boolean {
  return history.past.length > 0
}
export function canRedo(history: EditHistory): boolean {
  return history.future.length > 0
}

export function objectsOnPage(layer: EditLayer, page: number): EditObject[] {
  return layer.objects.filter((o) => o.page === page)
}

/** يحرّك كائنات صفحة عند حذف/إدراج صفحات حتى تبقى ملتصقة بصفحتها الأصلية. */
export function remapPages(layer: EditLayer, mapping: (oldPage: number) => number | null): EditLayer {
  const objects: EditObject[] = []
  for (const o of layer.objects) {
    const page = mapping(o.page)
    if (page !== null) objects.push({ ...o, page })
  }
  return { objects }
}

export function hitTest(layer: EditLayer, page: number, x: number, y: number): EditObject | null {
  const candidates = objectsOnPage(layer, page)
  for (let i = candidates.length - 1; i >= 0; i--) {
    const o = candidates[i]
    if (x >= o.x && x <= o.x + o.width && y >= o.y && y <= o.y + o.height) return o
  }
  return null
}

/** يحوّل #rrggbb إلى مكوّنات 0..1 (لـ pdf-lib). */
export function hexToRgb01(hex: string): [number, number, number] {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return [0, 0, 0]
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255]
}

export function isRtlText(text: string): boolean {
  const rtl = (text.match(/[֐-ࣿיִ-﷿ﹰ-﻿]/g) ?? []).length
  const latin = (text.match(/[A-Za-z]/g) ?? []).length
  return rtl > 0 && rtl >= latin
}

/** هل يمكن كتابة النص بالخطوط القياسية في pdf-lib (لاتيني/أرقام/ترقيم فقط)؟ */
export function isStandardFontSafe(text: string): boolean {
  // WinAnsi: ASCII المطبوع + بعض الرموز اللاتينية الممتدة
  return /^[\x20-\x7E -ÿ–—‘’“”•€]*$/.test(text)
}

export function serializeLayer(layer: EditLayer): string {
  return JSON.stringify(layer)
}

export function deserializeLayer(json: string): EditLayer {
  try {
    const parsed = JSON.parse(json) as EditLayer
    return Array.isArray(parsed?.objects) ? parsed : EMPTY_LAYER
  } catch {
    return EMPTY_LAYER
  }
}
