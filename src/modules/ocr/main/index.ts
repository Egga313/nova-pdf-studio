/**
 * خدمة OCR في العملية الرئيسية عبر tesseract.js (Node worker_threads) بملفات لغة محلية من resources/tessdata —
 * لا اتصال بالإنترنت. عامل واحد يُعاد استخدامه لنفس مجموعة اللغات، والطلبات تُنفَّذ بالتتابع.
 */
import fs from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow } from 'electron'
import { createWorker, type Worker, type Page, type Line as TessLine } from 'tesseract.js'
import { AppError } from '@shared/errors'
import type { OcrLine, OcrProgress, OcrRequest, OcrResult } from '@shared/ocr'
import { logger } from '@main/logger'
import { getPaths } from '@main/paths'

let worker: Worker | null = null
let workerLangs = ''
let currentJob: string | null = null
let queue: Promise<unknown> = Promise.resolve()

function tessdataDir(): string {
  return path.join(getPaths().resourcesDir, 'tessdata')
}

/** جذر حزمة tesseract.js؛ عند التغليف تكون منسوخة خارج asar (asarUnpack) فنحوّل المسار إلى app.asar.unpacked. */
function tesseractRoot(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pkg = require.resolve('tesseract.js/package.json')
  return path.dirname(pkg).replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`)
}

export function listOcrLanguages(): string[] {
  const dir = tessdataDir()
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => /\.traineddata(\.gz)?$/.test(f))
    .map((f) => f.replace(/\.traineddata(\.gz)?$/, ''))
    .sort()
}

function broadcast(progress: OcrProgress): void {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('ocr:progress', progress)
}

async function getWorker(languages: string[]): Promise<Worker> {
  const key = languages.join('+')
  if (worker && workerLangs === key) return worker
  if (worker) {
    await worker.terminate().catch(() => undefined)
    worker = null
  }
  const available = listOcrLanguages()
  const missing = languages.filter((l) => !available.includes(l))
  if (missing.length) throw new AppError('NOT_FOUND', 'ocr.missingLanguage', { lang: missing.join(', ') })
  const dir = tessdataDir()
  const gzip = fs.existsSync(path.join(dir, `${languages[0]}.traineddata.gz`))
  // داخل Electron يكتشف tesseract.js بيئة "electron" فيجلب اللغات عبر fetch؛ عاملنا المخصّص (resources/ocr/worker.cjs)
  // يقرأ الملفات من القرص بدلًا من الشبكة. NOVA_TESS_ROOT يخبر العامل بمكان وحدة tesseract.js (خارج asar عند التغليف).
  process.env.NOVA_TESS_ROOT = tesseractRoot()
  const workerPath = path.join(getPaths().resourcesDir, 'ocr', 'worker.cjs')
  logger.info('ocr: creating worker', { languages: key, dir, gzip, workerPath, tessRoot: process.env.NOVA_TESS_ROOT })
  worker = await createWorker(key, 1, {
    langPath: dir,
    gzip,
    workerPath,
    cacheMethod: 'none',
    logger: (m: { status: string; progress: number }) => {
      if (currentJob) broadcast({ jobId: currentJob, status: m.status, progress: m.progress })
    },
    errorHandler: (e: unknown) => logger.error('ocr worker error', e)
  })
  workerLangs = key
  return worker
}

function toLines(data: Page): OcrLine[] {
  const lines: TessLine[] = Array.isArray(data.lines) && data.lines.length
    ? data.lines
    : (data.blocks ?? []).flatMap((b) => (b.paragraphs ?? []).flatMap((p) => p.lines ?? []))
  return lines
    .filter((l) => l.text && l.text.trim())
    .map((l) => ({
      text: l.text.replace(/\s+$/g, ''),
      x0: l.bbox.x0, y0: l.bbox.y0, x1: l.bbox.x1, y1: l.bbox.y1,
      confidence: (l.confidence ?? 0) / 100,
      words: (l.words ?? []).filter((w) => w.text && w.text.trim()).map((w) => ({ text: w.text, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1, confidence: (w.confidence ?? 0) / 100 }))
    }))
}

/** يتعرف على صورة PNG؛ الطلبات تُصفّ حتى لا يتزاحم أكثر من طلب على العامل. */
export function recognizeImage(req: OcrRequest): Promise<OcrResult> {
  const run = async (): Promise<OcrResult> => {
    const started = Date.now()
    currentJob = req.jobId
    try {
      const w = await getWorker(req.languages)
      broadcast({ jobId: req.jobId, status: 'recognizing text', progress: 0 })
      const { data } = await w.recognize(Buffer.from(req.png), {}, { text: true, blocks: true })
      const lines = toLines(data)
      const result: OcrResult = {
        text: (data.text ?? '').trim(),
        confidence: (data.confidence ?? 0) / 100,
        lines,
        widthPx: req.widthPx,
        heightPx: req.heightPx,
        durationMs: Date.now() - started,
        languages: req.languages
      }
      broadcast({ jobId: req.jobId, status: 'done', progress: 1 })
      logger.info('ocr: page done', { jobId: req.jobId, ms: result.durationMs, confidence: result.confidence, lines: lines.length })
      return result
    } catch (e) {
      logger.error('ocr failed', e)
      throw e instanceof AppError ? e : new AppError('UNKNOWN', 'ocr.failed', undefined, e instanceof Error ? e.message : String(e))
    } finally {
      currentJob = null
    }
  }
  const p = queue.then(run, run)
  queue = p.catch(() => undefined)
  return p
}

export async function terminateOcr(): Promise<void> {
  if (worker) {
    await worker.terminate().catch(() => undefined)
    worker = null
    workerLangs = ''
  }
}

app.on('will-quit', () => {
  void terminateOcr()
})
