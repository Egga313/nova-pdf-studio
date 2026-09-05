/**
 * الطباعة والتصدير عبر محرك Chromium (دقة عالية، عربية وRTL صحيحة).
 *
 * الفكرة: الواجهة تجهّز HTML كاملًا (صفحات PDF كصور، أو فاتورة HTML) ونفتحه في نافذة مخفية ثم:
 *   - print()        → حوار الطابعة أو طباعة صامتة بإعدادات محددة
 *   - printToPDF()   → ملف PDF ناتج (تصدير الفواتير، "حفظ كـ PDF")
 */
import fsp from 'node:fs/promises'
import { BrowserWindow, type WebContentsPrintOptions } from 'electron'
import { AppError } from '@shared/errors'
import { logger } from '@main/logger'

export interface PrintJob {
  html: string
  title?: string
  paperSize?: 'A4' | 'A5' | 'Letter' | { widthMicrons: number; heightMicrons: number }
  landscape?: boolean
  marginsMm?: number
  copies?: number
  silent?: boolean
  deviceName?: string
  scalePercent?: number
  pageRanges?: { from: number; to: number }[]
}

export interface PdfExportJob {
  html: string
  outputPath: string
  paperSize?: 'A4' | 'A5' | 'Letter' | { widthMicrons: number; heightMicrons: number }
  landscape?: boolean
  marginsMm?: number
  printBackground?: boolean
}

const PAGE_MICRONS: Record<'A4' | 'A5' | 'Letter', { width: number; height: number }> = {
  A4: { width: 210_000, height: 297_000 },
  A5: { width: 148_000, height: 210_000 },
  Letter: { width: 215_900, height: 279_400 }
}

async function openHidden(html: string, timeoutMs = 30_000): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, javascript: false, images: true }
  })
  const loaded = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new AppError('UNKNOWN', 'errors.print.timeout')), timeoutMs)
    win.webContents.once('did-finish-load', () => {
      clearTimeout(timer)
      resolve()
    })
    win.webContents.once('did-fail-load', (_e, code, desc) => {
      clearTimeout(timer)
      reject(new AppError('UNKNOWN', 'errors.print.load_failed', undefined, `${code} ${desc}`))
    })
  })
  await win.loadURL(`data:text/html;charset=utf-8;base64,${Buffer.from(html, 'utf8').toString('base64')}`)
  await loaded
  // نمنح المحرك لحظة لإكمال تحميل الخطوط والصور المضمّنة
  await new Promise((r) => setTimeout(r, 150))
  return win
}

function pageSize(size: PrintJob['paperSize']): WebContentsPrintOptions['pageSize'] {
  if (!size) return 'A4'
  if (typeof size === 'string') return size
  return { width: size.widthMicrons, height: size.heightMicrons }
}

export async function listPrinters(owner?: BrowserWindow): Promise<{ name: string; displayName: string; isDefault: boolean; status: number }[]> {
  const win = owner ?? BrowserWindow.getAllWindows()[0]
  if (!win) return []
  const printers = await win.webContents.getPrintersAsync()
  return printers.map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: p.isDefault, status: p.status }))
}

export async function printHtml(job: PrintJob): Promise<{ success: boolean; reason?: string }> {
  const win = await openHidden(job.html)
  try {
    const margins = job.marginsMm ?? 10
    const options: WebContentsPrintOptions = {
      silent: job.silent ?? false,
      printBackground: true,
      deviceName: job.deviceName,
      copies: job.copies ?? 1,
      landscape: job.landscape ?? false,
      pageSize: pageSize(job.paperSize),
      margins: { marginType: 'custom', top: margins / 25.4 * 72, bottom: margins / 25.4 * 72, left: margins / 25.4 * 72, right: margins / 25.4 * 72 },
      scaleFactor: job.scalePercent ?? 100,
      pageRanges: job.pageRanges,
      header: '',
      footer: ''
    }
    return await new Promise((resolve) => {
      win.webContents.print(options, (success, failureReason) => {
        if (!success && failureReason && failureReason !== 'cancelled') logger.warn('print failed', failureReason)
        resolve({ success, reason: failureReason || undefined })
      })
    })
  } finally {
    // ننتظر قليلًا قبل الإغلاق حتى يلتقط نظام الطباعة المستند
    setTimeout(() => !win.isDestroyed() && win.destroy(), 1500)
  }
}

export async function exportHtmlToPdf(job: PdfExportJob): Promise<{ path: string; sizeBytes: number }> {
  const win = await openHidden(job.html)
  try {
    const margins = (job.marginsMm ?? 10) / 25.4 // بوصة
    const data = await win.webContents.printToPDF({
      printBackground: job.printBackground ?? true,
      landscape: job.landscape ?? false,
      pageSize: pageSize(job.paperSize) as never,
      margins: { top: margins, bottom: margins, left: margins, right: margins },
      preferCSSPageSize: false
    })
    const temp = `${job.outputPath}.tmp-${process.pid}`
    await fsp.writeFile(temp, data)
    await fsp.rename(temp, job.outputPath)
    return { path: job.outputPath, sizeBytes: data.byteLength }
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

/** يحوّل قائمة صور صفحات (data URLs) إلى HTML للطباعة، صفحة لكل ورقة. */
export function pagesToPrintHtml(images: string[], options: { widthMm: number; heightMm: number; title?: string }): string {
  const pages = images
    .map((src) => `<div class="page"><img src="${src}" alt="" /></div>`)
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(options.title ?? 'NOVA')}</title>
<style>
  @page { size: ${options.widthMm}mm ${options.heightMm}mm; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .page { width: ${options.widthMm}mm; height: ${options.heightMm}mm; display: flex; align-items: center; justify-content: center; page-break-after: always; break-after: page; overflow: hidden; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  img { max-width: 100%; max-height: 100%; object-fit: contain; }
</style></head><body>${pages}</body></html>`
}

export { PAGE_MICRONS }

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
