/**
 * أدوات PDF على مستوى البايتات (pdf-lib): دمج، تقسيم، استخراج، حذف، ترتيب، تدوير، تكرار، صفحة فارغة،
 * إدراج PDF/صورة، علامة مائية، أرقام صفحات، ضغط (إعادة حفظ بتدفقات الكائنات).
 * دوال نقية تعمل في المتصفح وNode معًا (قابلة للاختبار بلا Electron).
 */
import { degrees, PDFDocument, rgb, StandardFonts, type PDFPage } from 'pdf-lib'
import { AppError } from '@shared/errors'

export type PageSizeName = 'A4' | 'A5' | 'Letter'
export const PAGE_SIZES: Record<PageSizeName, [number, number]> = {
  A4: [595.28, 841.89],
  A5: [419.53, 595.28],
  Letter: [612, 792]
}

async function load(bytes: Uint8Array, password?: string): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: !!password || false, updateMetadata: false })
  } catch (error) {
    const message = String(error)
    if (/encrypted/i.test(message)) throw new AppError('PDF_PASSWORD', undefined, undefined, message)
    throw new AppError('PDF_CORRUPTED', undefined, undefined, message)
  }
}

async function save(doc: PDFDocument): Promise<Uint8Array> {
  return doc.save({ useObjectStreams: true, addDefaultPage: false })
}

/** يحوّل نصًا مثل "1-3, 5, 8-" إلى فهارس صفرية مرتبة بلا تكرار. */
export function parsePageRange(text: string, pageCount: number): number[] {
  const out = new Set<number>()
  for (const part of text.split(/[،,]/)) {
    const token = part.trim()
    if (!token) continue
    const m = token.match(/^(\d*)\s*-\s*(\d*)$/)
    if (m) {
      const start = m[1] ? Number(m[1]) : 1
      const end = m[2] ? Number(m[2]) : pageCount
      if (start < 1 || end < start) throw new AppError('VALIDATION', 'errors.pdf.bad_range', { range: token })
      for (let p = start; p <= Math.min(end, pageCount); p++) out.add(p - 1)
    } else if (/^\d+$/.test(token)) {
      const p = Number(token)
      if (p >= 1 && p <= pageCount) out.add(p - 1)
      else throw new AppError('VALIDATION', 'errors.pdf.bad_range', { range: token })
    } else {
      throw new AppError('VALIDATION', 'errors.pdf.bad_range', { range: token })
    }
  }
  return [...out].sort((a, b) => a - b)
}

export async function pageCount(bytes: Uint8Array): Promise<number> {
  return (await load(bytes)).getPageCount()
}

export async function merge(documents: Uint8Array[]): Promise<Uint8Array> {
  if (documents.length === 0) throw new AppError('VALIDATION', 'errors.pdf.no_files')
  const out = await PDFDocument.create()
  for (const bytes of documents) {
    const src = await load(bytes)
    const pages = await out.copyPages(src, src.getPageIndices())
    pages.forEach((p) => out.addPage(p))
  }
  return save(out)
}

/** يستخرج الصفحات المحددة إلى مستند جديد (يحافظ على الترتيب المطلوب). */
export async function extractPages(bytes: Uint8Array, indices: number[]): Promise<Uint8Array> {
  const src = await load(bytes)
  const valid = indices.filter((i) => i >= 0 && i < src.getPageCount())
  if (valid.length === 0) throw new AppError('VALIDATION', 'errors.pdf.no_pages')
  const out = await PDFDocument.create()
  const pages = await out.copyPages(src, valid)
  pages.forEach((p) => out.addPage(p))
  return save(out)
}

/** يقسّم المستند: كل صفحة ملف، أو كل n صفحات ملف، أو حسب نطاقات صريحة. */
export async function split(bytes: Uint8Array, mode: { every: number } | { ranges: number[][] }): Promise<Uint8Array[]> {
  const src = await load(bytes)
  const count = src.getPageCount()
  const groups: number[][] = []
  if ('every' in mode) {
    const n = Math.max(1, mode.every)
    for (let i = 0; i < count; i += n) groups.push(Array.from({ length: Math.min(n, count - i) }, (_, k) => i + k))
  } else {
    groups.push(...mode.ranges)
  }
  const results: Uint8Array[] = []
  for (const group of groups) {
    const out = await PDFDocument.create()
    const pages = await out.copyPages(src, group.filter((i) => i >= 0 && i < count))
    pages.forEach((p) => out.addPage(p))
    results.push(await save(out))
  }
  return results
}

export async function deletePages(bytes: Uint8Array, indices: number[]): Promise<Uint8Array> {
  const doc = await load(bytes)
  const remove = new Set(indices)
  if (remove.size >= doc.getPageCount()) throw new AppError('VALIDATION', 'errors.pdf.cannot_delete_all')
  for (let i = doc.getPageCount() - 1; i >= 0; i--) if (remove.has(i)) doc.removePage(i)
  return save(doc)
}

/** يعيد ترتيب الصفحات وفق قائمة كاملة من الفهارس الجديدة (order[k] = فهرس الصفحة الأصلية في الموضع k). */
export async function reorderPages(bytes: Uint8Array, order: number[]): Promise<Uint8Array> {
  const src = await load(bytes)
  const count = src.getPageCount()
  if (order.length !== count || new Set(order).size !== count || order.some((i) => i < 0 || i >= count)) {
    throw new AppError('VALIDATION', 'errors.pdf.bad_order')
  }
  const out = await PDFDocument.create()
  const pages = await out.copyPages(src, order)
  pages.forEach((p) => out.addPage(p))
  return save(out)
}

export async function rotatePages(bytes: Uint8Array, indices: number[] | 'all', angle: 90 | 180 | 270 | -90): Promise<Uint8Array> {
  const doc = await load(bytes)
  const targets = indices === 'all' ? doc.getPageIndices() : indices
  for (const i of targets) {
    const page = doc.getPage(i)
    page.setRotation(degrees(((page.getRotation().angle + angle) % 360 + 360) % 360))
  }
  return save(doc)
}

export async function duplicatePage(bytes: Uint8Array, index: number): Promise<Uint8Array> {
  const doc = await load(bytes)
  const [copy] = await doc.copyPages(doc, [index])
  doc.insertPage(index + 1, copy)
  return save(doc)
}

export async function insertBlankPage(bytes: Uint8Array, index: number, size?: [number, number]): Promise<Uint8Array> {
  const doc = await load(bytes)
  const ref = doc.getPageCount() ? doc.getPage(Math.min(index, doc.getPageCount() - 1)).getSize() : { width: 595.28, height: 841.89 }
  doc.insertPage(Math.min(index, doc.getPageCount()), size ?? [ref.width, ref.height])
  return save(doc)
}

export async function insertPdf(bytes: Uint8Array, other: Uint8Array, atIndex: number): Promise<Uint8Array> {
  const doc = await load(bytes)
  const src = await load(other)
  const pages = await doc.copyPages(src, src.getPageIndices())
  pages.forEach((p, k) => doc.insertPage(Math.min(atIndex + k, doc.getPageCount()), p))
  return save(doc)
}

export interface ImagePlacement {
  pageIndex: number
  x: number          // نقاط من اليسار
  y: number          // نقاط من الأعلى
  width: number
  height: number
}

/** يدرج صورة PNG/JPEG في صفحة (الإحداثيات من أعلى-يسار كما في الواجهة). */
export async function insertImage(bytes: Uint8Array, image: Uint8Array, mime: 'image/png' | 'image/jpeg', placement: ImagePlacement): Promise<Uint8Array> {
  const doc = await load(bytes)
  const page = doc.getPage(placement.pageIndex)
  const embedded = mime === 'image/png' ? await doc.embedPng(image) : await doc.embedJpg(image)
  const { height } = page.getSize()
  page.drawImage(embedded, { x: placement.x, y: height - placement.y - placement.height, width: placement.width, height: placement.height })
  return save(doc)
}

/** ينشئ مستندًا من صور (كل صورة صفحة بمقاسها أو مقاس ورقة). */
export async function imagesToPdf(images: { data: Uint8Array; mime: 'image/png' | 'image/jpeg' }[], paper?: PageSizeName): Promise<Uint8Array> {
  if (images.length === 0) throw new AppError('VALIDATION', 'errors.pdf.no_files')
  const doc = await PDFDocument.create()
  for (const img of images) {
    const embedded = img.mime === 'image/png' ? await doc.embedPng(img.data) : await doc.embedJpg(img.data)
    if (paper) {
      const [w, h] = PAGE_SIZES[paper]
      const page = doc.addPage([w, h])
      const margin = 36
      const scale = Math.min((w - margin * 2) / embedded.width, (h - margin * 2) / embedded.height)
      const dw = embedded.width * scale
      const dh = embedded.height * scale
      page.drawImage(embedded, { x: (w - dw) / 2, y: (h - dh) / 2, width: dw, height: dh })
    } else {
      const page = doc.addPage([embedded.width, embedded.height])
      page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height })
    }
  }
  return save(doc)
}

export interface WatermarkOptions {
  text: string
  opacity?: number       // 0..1
  fontSize?: number
  angleDeg?: number
  color?: [number, number, number]
}

/** علامة مائية نصية (لاتينية عبر الخط القياسي؛ النص العربي يُمرَّر كصورة من الواجهة عند الحاجة). */
export async function addWatermark(bytes: Uint8Array, options: WatermarkOptions): Promise<Uint8Array> {
  const doc = await load(bytes)
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  const size = options.fontSize ?? 48
  const [r, g, b] = options.color ?? [0.6, 0.6, 0.6]
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize()
    const textWidth = font.widthOfTextAtSize(options.text, size)
    page.drawText(options.text, {
      x: (width - textWidth) / 2,
      y: height / 2,
      size,
      font,
      color: rgb(r, g, b),
      opacity: options.opacity ?? 0.25,
      rotate: degrees(options.angleDeg ?? 35)
    })
  }
  return save(doc)
}

export interface PageNumberOptions {
  position?: 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center'
  format?: string       // مثل "{n} / {total}"
  fontSize?: number
  startAt?: number
}

export async function addPageNumbers(bytes: Uint8Array, options: PageNumberOptions = {}): Promise<Uint8Array> {
  const doc = await load(bytes)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const size = options.fontSize ?? 10
  const total = doc.getPageCount()
  doc.getPages().forEach((page: PDFPage, i) => {
    const label = (options.format ?? '{n} / {total}').replace('{n}', String(i + (options.startAt ?? 1))).replace('{total}', String(total))
    const { width, height } = page.getSize()
    const tw = font.widthOfTextAtSize(label, size)
    const pos = options.position ?? 'bottom-center'
    const x = pos.endsWith('right') ? width - tw - 36 : pos.endsWith('left') ? 36 : (width - tw) / 2
    const y = pos.startsWith('top') ? height - 30 : 24
    page.drawText(label, { x, y, size, font, color: rgb(0.3, 0.3, 0.3) })
  })
  return save(doc)
}

/** "ضغط": إعادة حفظ بتدفقات كائنات وإزالة البيانات الوصفية الزائدة؛ لا يعيد ترميز الصور. */
export async function compress(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await load(bytes)
  doc.setProducer('NOVA PDF Studio')
  return doc.save({ useObjectStreams: true, addDefaultPage: false, objectsPerTick: 200 })
}

export async function setMetadata(bytes: Uint8Array, meta: { title?: string; author?: string; subject?: string; keywords?: string[] }): Promise<Uint8Array> {
  const doc = await load(bytes)
  if (meta.title !== undefined) doc.setTitle(meta.title)
  if (meta.author !== undefined) doc.setAuthor(meta.author)
  if (meta.subject !== undefined) doc.setSubject(meta.subject)
  if (meta.keywords) doc.setKeywords(meta.keywords)
  return save(doc)
}

/** ينشئ مستندًا فارغًا بمقاس واتجاه. */
export async function createBlank(paper: PageSizeName | [number, number], orientation: 'portrait' | 'landscape', pages = 1): Promise<Uint8Array> {
  const [w, h] = Array.isArray(paper) ? paper : PAGE_SIZES[paper]
  const size: [number, number] = orientation === 'landscape' ? [Math.max(w, h), Math.min(w, h)] : [Math.min(w, h), Math.max(w, h)]
  const doc = await PDFDocument.create()
  for (let i = 0; i < Math.max(1, pages); i++) doc.addPage(size)
  doc.setProducer('NOVA PDF Studio')
  doc.setCreator('NOVA PDF Studio')
  return save(doc)
}
