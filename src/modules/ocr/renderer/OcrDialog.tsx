/**
 * حوار OCR داخل عارض PDF: اختيار النطاق واللغات، تقدّم لكل صفحة، النص الناتج، ثم إجراءات:
 * نسخ، حفظ كنص، جعل المستند قابلًا للبحث (طبقة نص في العارض + قاعدة البيانات)، تصدير PDF قابل للبحث.
 */
import { clsx } from 'clsx'
import { Copy, FileDown, FileText, ScanText, Search, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { StoreApi } from 'zustand'
import { OCR_LANGUAGES } from '@shared/ocr'
import { Button, Dialog, Switch } from '@renderer/components/ui'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'
import { useSettings } from '@renderer/stores/settings'
import type { ViewerState } from '@modules/pdf/renderer/usePdfViewer'
import { ocrPages, type PageOcr } from './ocrClient'
import { addInvisibleTextLayer } from './searchablePdf'

interface Props {
  open: boolean
  onClose: () => void
  store: StoreApi<ViewerState>
  autoStart?: boolean
}

export function OcrDialog({ open, onClose, store, autoStart }: Props) {
  const { t } = useTranslation()
  const settingsLangs = useSettings((s) => s.settings.ocr.languages)
  const [available, setAvailable] = useState<string[] | null>(null)
  const [langs, setLangs] = useState<string[]>(settingsLangs)
  const [scope, setScope] = useState<'page' | 'all'>('page')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ page: number; total: number; status: string; pct: number } | null>(null)
  const [results, setResults] = useState<PageOcr[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const signal = useRef({ cancelled: false })
  const started = useRef(false)

  useEffect(() => {
    if (!open) return
    invoke('ocr:languages').then((list) => {
      setAvailable(list)
      setLangs((cur) => {
        const ok = cur.filter((l) => list.includes(l))
        return ok.length ? ok : list.slice(0, 1)
      })
    }).catch((e) => notify.error(e))
  }, [open])

  const start = async () => {
    const s = store.getState()
    if (!s.engine || running) return
    if (!langs.length) {
      notify.warning('ocr.selectLanguage')
      return
    }
    signal.current = { cancelled: false }
    setRunning(true)
    setResults([])
    const indices = scope === 'page' ? [s.currentPage] : s.pages.map((p) => p.index)
    setProgress({ page: 1, total: indices.length, status: 'loading', pct: 0 })
    try {
      const out = await ocrPages(
        s.engine, indices, langs,
        (done, total, page) => {
          setResults((r) => [...r, page])
          setProgress({ page: Math.min(done + 1, total), total, status: 'recognizing', pct: done / total })
          store.getState().bumpOcr()
        },
        (p) => setProgress((cur) => cur ? { ...cur, status: p.status.includes('recogniz') ? 'recognizing' : p.status.includes('load') || p.status.includes('initializ') ? 'loading' : cur.status, pct: ((cur.page - 1) + p.progress) / cur.total } : cur),
        signal.current
      )
      if (out.length) {
        const avg = out.reduce((a, p) => a + p.result.confidence, 0) / out.length
        notify.success('ocr.done', { pages: out.length, confidence: Math.round(avg * 100) })
        if (avg < 0.5) notify.warning('ocr.lowConfidence')
      }
    } catch (e) {
      notify.error(e, 'ocr.failed')
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  useEffect(() => {
    if (open && autoStart && available && !started.current) {
      started.current = true
      void start()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoStart, available])

  const allText = () => results.map((r) => `--- ${t('ocr.page', { page: r.index + 1 })} ---\n${r.result.text}`).join('\n\n')

  const copy = async () => {
    await navigator.clipboard.writeText(results.map((r) => r.result.text).join('\n\n'))
    notify.success('toast.copied')
  }
  const saveText = async () => {
    const s = store.getState()
    const target = await invoke('dialog:save-file', { defaultPath: s.fileName.replace(/\.pdf$/i, '') + '.txt', filters: [{ name: 'Text', extensions: ['txt'] }] })
    if (!target) return
    await invoke('file:write', { path: target, data: new TextEncoder().encode(allText()) })
    notify.success('ocr.textSaved')
  }
  const makeSearchable = async () => {
    setBusy('searchable')
    try {
      const s = store.getState()
      let documentId = s.documentId
      if (!documentId && s.path) {
        const doc = await invoke('documents:register', { path: s.path, title: s.fileName, pageCount: s.pages.length, sizeBytes: s.bytes?.byteLength ?? null, isScanned: true })
        documentId = doc.id
        store.setState({ documentId })
      }
      if (documentId) {
        for (const r of results) await invoke('documents:save-page-text', { documentId, pageIndex: r.index, text: r.result.text, confidence: r.result.confidence, layout: JSON.stringify(r.spans) })
        await invoke('documents:mark-ocr', { documentId })
      }
      store.getState().bumpOcr()
      store.getState().dismissScannedNotice()
      notify.success('ocr.searchableDone')
    } catch (e) {
      notify.error(e)
    } finally {
      setBusy(null)
    }
  }
  const exportSearchable = async () => {
    setBusy('export')
    try {
      const s = store.getState()
      if (!s.bytes) return
      const target = await invoke('dialog:save-file', { defaultPath: s.fileName.replace(/\.pdf$/i, '') + '-searchable.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] })
      if (!target) return
      const font = await invoke('app:read-resource', { relativePath: 'fonts/NotoNaskhArabic-Regular.ttf' }).catch(() => null)
      const pages = await Promise.all(results.map(async (r) => {
        const info = await s.engine!.pageInfo(r.index)
        return { index: r.index, spans: r.spans, pageWidthPt: info.widthPt, pageHeightPt: info.heightPt }
      }))
      const out = await addInvisibleTextLayer(s.bytes, pages, font)
      await invoke('file:write', { path: target, data: out })
      notify.success('ocr.exportedSearchable', { name: target.split(/[\\/]/).pop() ?? target })
    } catch (e) {
      notify.error(e)
    } finally {
      setBusy(null)
    }
  }

  const noLangs = available !== null && available.length === 0

  return (
    <Dialog open={open} onClose={() => { if (running) signal.current.cancelled = true; onClose() }} title={<span className="flex items-center gap-2"><ScanText className="h-4 w-4 text-accent" />{t('ocr.title')}</span>} width="max-w-3xl"
      footer={
        <>
          <span className="me-auto text-xs text-muted">{t('ocr.hint')}</span>
          {results.length > 0 && (
            <>
              <Button size="sm" variant="ghost" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => void copy()}>{t('ocr.copy')}</Button>
              <Button size="sm" variant="ghost" icon={<FileText className="h-3.5 w-3.5" />} onClick={() => void saveText()}>{t('ocr.saveText')}</Button>
              <Button size="sm" variant="outline" icon={<FileDown className="h-3.5 w-3.5" />} loading={busy === 'export'} onClick={() => void exportSearchable()}>{t('ocr.exportSearchable')}</Button>
              <Button size="sm" variant="primary" icon={<Search className="h-3.5 w-3.5" />} loading={busy === 'searchable'} onClick={() => void makeSearchable()}>{t('ocr.makeSearchable')}</Button>
            </>
          )}
        </>
      }>
      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <div className="space-y-4">
          <div>
            <div className="label">{t('ocr.scope')}</div>
            <div className="flex overflow-hidden rounded-md border border-border text-xs">
              {(['page', 'all'] as const).map((sc) => (
                <button key={sc} type="button" onClick={() => setScope(sc)} className={clsx('flex-1 px-2 py-1.5', scope === sc ? 'bg-accent text-accent-fg' : 'hover:bg-surface-2')}>{t(sc === 'page' ? 'ocr.scopePage' : 'ocr.scopeAll')}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="label">{t('ocr.languages')}</div>
            {noLangs ? <p className="text-xs text-danger">{t('ocr.noLanguages')}</p> : (
              <div className="space-y-1.5">
                {OCR_LANGUAGES.filter((l) => !available || available.includes(l.code)).map((l) => (
                  <Switch key={l.code} checked={langs.includes(l.code)} label={l.label} onChange={(v) => setLangs((cur) => (v ? [...cur, l.code] : cur.filter((c) => c !== l.code)))} />
                ))}
              </div>
            )}
          </div>
          {running ? (
            <Button className="w-full" variant="danger" icon={<Square className="h-3.5 w-3.5" />} onClick={() => { signal.current.cancelled = true }}>{t('ocr.stop')}</Button>
          ) : (
            <Button className="w-full" variant="primary" icon={<ScanText className="h-4 w-4" />} disabled={noLangs || !available} onClick={() => void start()}>{t('ocr.start')}</Button>
          )}
          {progress && (
            <div className="space-y-1 text-xs text-muted">
              <div className="flex justify-between"><span>{t('ocr.progress', { page: progress.page, total: progress.total })}</span><span className="ltr-text">{Math.round(progress.pct * 100)}%</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-accent transition-all" style={{ width: `${Math.round(progress.pct * 100)}%` }} /></div>
              <div>{t(`ocr.status.${progress.status}`)}</div>
            </div>
          )}
        </div>
        <div className="min-h-[320px] max-h-[60vh] overflow-auto rounded-md border border-border bg-surface-2/40 p-3">
          {results.length === 0 ? (
            <div className="flex h-full min-h-[280px] items-center justify-center text-sm text-muted">{running ? t('ocr.status.recognizing') : t('ocr.resultText')}</div>
          ) : results.map((r) => (
            <div key={r.index} className="mb-3 rounded-md border border-border bg-surface p-3">
              <div className="mb-2 flex items-center justify-between text-xs text-muted">
                <span className="font-medium text-fg">{t('ocr.page', { page: r.index + 1 })}</span>
                <span className={clsx('rounded-full px-2 py-0.5 ltr-text', r.result.confidence >= 0.8 ? 'bg-success/15 text-success' : r.result.confidence >= 0.5 ? 'bg-warning/15 text-warning' : 'bg-danger/15 text-danger')}>{t('ocr.confidence')} {Math.round(r.result.confidence * 100)}%</span>
              </div>
              <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed" dir="auto">{r.result.text || t('ocr.empty')}</pre>
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  )
}
