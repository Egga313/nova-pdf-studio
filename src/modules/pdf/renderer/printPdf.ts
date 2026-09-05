/**
 * طباعة/تصدير مستند PDF من العارض: نصيّر الصفحات المطلوبة كصور بدقة عالية ثم نمرّرها إلى محرك Chromium
 * (طباعة أو حفظ كـ PDF)، أو نحفظها كصور PNG / نص.
 */
import type { PageInfo, PdfEngine } from './pdfEngine'
import { invoke } from '@renderer/lib/ipc'

const PT_TO_MM = 25.4 / 72

export async function renderPageToDataUrl(engine: PdfEngine, index: number, dpi = 150, rotation = 0): Promise<string> {
  const canvas = document.createElement('canvas')
  const scale = dpi / 72
  const { done } = await engine.render(index, canvas, scale, rotation)
  await done
  return canvas.toDataURL('image/png')
}

export async function renderPageToBlob(engine: PdfEngine, index: number, dpi = 150, rotation = 0): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  const { done } = await engine.render(index, canvas, dpi / 72, rotation)
  await done
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('canvas.toBlob failed')
  return new Uint8Array(await blob.arrayBuffer())
}

function buildHtml(images: { src: string; widthMm: number; heightMm: number }[], title: string): string {
  const pages = images
    .map(
      (img) =>
        `<div class="page" style="width:${img.widthMm}mm;height:${img.heightMm}mm"><img src="${img.src}" style="width:${img.widthMm}mm;height:${img.heightMm}mm" alt=""/></div>`
    )
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/[<>&]/g, '')}</title>
<style>
  @page { margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .page { display: block; page-break-after: always; break-after: page; overflow: hidden; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  img { display: block; }
</style></head><body>${pages}</body></html>`
}

export interface PrintOptions {
  pages?: number[]            // فهارس صفرية؛ الافتراضي كل الصفحات
  dpi?: number
  rotation?: number
  copies?: number
  deviceName?: string
  silent?: boolean
}

/** يطبع الصفحات عبر حوار الطابعة (أو صامتًا). كل صفحة تُطبع بمقاسها الأصلي. */
export async function printDocument(engine: PdfEngine, pages: PageInfo[], title: string, options: PrintOptions = {}): Promise<{ success: boolean; reason?: string }> {
  const indices = options.pages ?? pages.map((p) => p.index)
  const rotation = options.rotation ?? 0
  const images = []
  for (const index of indices) {
    const page = pages[index]
    const rotated = ((page.rotation + rotation) % 180) !== 0
    images.push({
      src: await renderPageToDataUrl(engine, index, options.dpi ?? 200, rotation),
      widthMm: (rotated ? page.heightPt : page.widthPt) * PT_TO_MM,
      heightMm: (rotated ? page.widthPt : page.heightPt) * PT_TO_MM
    })
  }
  const first = pages[indices[0]]
  const rotatedFirst = ((first.rotation + rotation) % 180) !== 0
  const widthMm = (rotatedFirst ? first.heightPt : first.widthPt) * PT_TO_MM
  const heightMm = (rotatedFirst ? first.widthPt : first.heightPt) * PT_TO_MM
  return invoke('print:html', {
    html: buildHtml(images, title),
    title,
    paperSize: { widthMicrons: Math.round(widthMm * 1000), heightMicrons: Math.round(heightMm * 1000) },
    landscape: false,
    marginsMm: 0,
    copies: options.copies ?? 1,
    deviceName: options.deviceName,
    silent: options.silent ?? false
  })
}

/** يحفظ نسخة PDF "مسطّحة" (صور) — يُستخدم عند طلب "حفظ كـ PDF" من حوار الطباعة أو لتصدير صفحات محددة. */
export async function exportFlattenedPdf(engine: PdfEngine, pages: PageInfo[], title: string, outputPath: string, indices?: number[], rotation = 0, dpi = 200): Promise<{ path: string; sizeBytes: number }> {
  const selected = indices ?? pages.map((p) => p.index)
  const images = []
  for (const index of selected) {
    const page = pages[index]
    const rotated = ((page.rotation + rotation) % 180) !== 0
    images.push({
      src: await renderPageToDataUrl(engine, index, dpi, rotation),
      widthMm: (rotated ? page.heightPt : page.widthPt) * PT_TO_MM,
      heightMm: (rotated ? page.widthPt : page.heightPt) * PT_TO_MM
    })
  }
  const first = pages[selected[0]]
  const rotatedFirst = ((first.rotation + rotation) % 180) !== 0
  return invoke('print:html-to-pdf', {
    html: buildHtml(images, title),
    outputPath,
    paperSize: {
      widthMicrons: Math.round((rotatedFirst ? first.heightPt : first.widthPt) * PT_TO_MM * 1000),
      heightMicrons: Math.round((rotatedFirst ? first.widthPt : first.heightPt) * PT_TO_MM * 1000)
    },
    marginsMm: 0
  })
}

/** يصدّر كل صفحة كملف PNG في مجلد. يعيد المسارات. */
export async function exportPagesAsImages(engine: PdfEngine, pages: PageInfo[], folder: string, baseName: string, dpi = 150, onProgress?: (done: number, total: number) => void): Promise<string[]> {
  const out: string[] = []
  for (const page of pages) {
    const data = await renderPageToBlob(engine, page.index, dpi)
    const filePath = `${folder}\\${baseName}-${String(page.index + 1).padStart(3, '0')}.png`
    await invoke('file:write', { path: filePath, data })
    out.push(filePath)
    onProgress?.(page.index + 1, pages.length)
  }
  return out
}

export async function exportText(engine: PdfEngine, pages: PageInfo[], outputPath: string): Promise<void> {
  const chunks: string[] = []
  for (const page of pages) chunks.push(`--- ${page.index + 1} ---\n${await engine.pageText(page.index)}`)
  await invoke('file:write', { path: outputPath, data: new TextEncoder().encode(chunks.join('\n\n')) })
}
