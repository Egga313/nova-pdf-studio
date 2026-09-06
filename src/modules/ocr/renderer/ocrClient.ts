/**
 * عميل OCR في الواجهة: يصيّر صفحة PDF إلى PNG بدقة OCR_DPI، يرسلها للعملية الرئيسية، ويحوّل الأسطر الناتجة
 * إلى مقاطع نص بإحداثيات نقاط الصفحة لتُدمج في طبقة النص (بحث/تحديد/نسخ) أو تُستخدم في الاستخراج.
 */
import type { OcrProgress, OcrResult } from '@shared/ocr'
import { OCR_DPI } from '@shared/ocr'
import type { PdfEngine, TextSpan } from '@modules/pdf/renderer/pdfEngine'
import { invoke, onMainEvent } from '@renderer/lib/ipc'

const ARABIC = /[؀-ۿ]/

export interface PageOcr {
  index: number
  result: OcrResult
  spans: TextSpan[]
}

export function ocrLinesToSpans(result: OcrResult, pageWidthPt: number): TextSpan[] {
  const f = pageWidthPt / result.widthPx
  return result.lines
    .filter((l) => l.text.trim())
    .map((l) => {
      const height = (l.y1 - l.y0) * f
      return {
        text: l.text.trim(),
        x: l.x0 * f,
        y: l.y0 * f,
        width: (l.x1 - l.x0) * f,
        height,
        fontSize: Math.max(4, height * 0.85),
        dir: ARABIC.test(l.text) ? 'rtl' : 'ltr',
        fontName: 'ocr'
      }
    })
}

async function renderPng(engine: PdfEngine, index: number): Promise<{ png: Uint8Array; widthPx: number; heightPx: number }> {
  const canvas = document.createElement('canvas')
  const { done } = await engine.render(index, canvas, OCR_DPI / 72, 0)
  await done
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('canvas.toBlob failed')
  return { png: new Uint8Array(await blob.arrayBuffer()), widthPx: canvas.width, heightPx: canvas.height }
}

let jobSeq = 0

export async function ocrPage(engine: PdfEngine, index: number, languages: string[], onProgress?: (p: OcrProgress) => void): Promise<PageOcr> {
  const jobId = `ocr-${Date.now().toString(36)}-${(jobSeq++).toString(36)}`
  const info = await engine.pageInfo(index)
  const { png, widthPx, heightPx } = await renderPng(engine, index)
  const unsub = onProgress ? onMainEvent('ocr:progress', (p) => p.jobId === jobId && onProgress(p)) : null
  try {
    const result = await invoke('ocr:recognize', { jobId, png, languages, widthPx, heightPx })
    return { index, result, spans: ocrLinesToSpans(result, info.widthPt) }
  } finally {
    unsub?.()
  }
}

/** يشغّل OCR على عدة صفحات بالتتابع مع إمكانية الإلغاء. */
export async function ocrPages(
  engine: PdfEngine,
  indices: number[],
  languages: string[],
  onPage?: (done: number, total: number, page: PageOcr) => void,
  onProgress?: (p: OcrProgress & { page: number }) => void,
  signal?: { cancelled: boolean }
): Promise<PageOcr[]> {
  const out: PageOcr[] = []
  for (let i = 0; i < indices.length; i++) {
    if (signal?.cancelled) break
    const page = await ocrPage(engine, indices[i], languages, (p) => onProgress?.({ ...p, page: indices[i] }))
    engine.setOcrSpans(indices[i], page.spans)
    out.push(page)
    onPage?.(i + 1, indices.length, page)
  }
  return out
}
