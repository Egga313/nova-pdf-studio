/**
 * استيراد مجموعة ملفات PDF كمسودات فواتير: تُعالَج بالتتابع (قراءة → نص/OCR → قالب مطابق أو كشف تلقائي → حفظ).
 * الملفات التي لا تحوي بنودًا أو عميلًا تُترك للمراجعة الفردية بدل تلفيق بيانات.
 */
import { clsx } from 'clsx'
import { CheckCircle2, FileText, FolderOpen, Play, XCircle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ExtractionDefinition, ExtractionTemplate } from '@shared/extraction'
import { PdfEngine } from '@modules/pdf/renderer/pdfEngine'
import { ocrPage } from '@modules/ocr/renderer/ocrClient'
import { baseName } from '@renderer/app/openFile'
import { Badge, Button, Dialog, Select } from '@renderer/components/ui'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'
import { useTabs } from '@renderer/stores/tabs'
import { autoExtract, extractWithDefinition, groupLines, lineLogicalText, templateScore, toInvoicePrefill, type Span } from '../shared/extract'

interface Row {
  path: string
  status: 'pending' | 'processing' | 'done' | 'failed' | 'skipped'
  message?: string
  invoiceId?: number
  number?: string
}

interface Props {
  open: boolean
  onClose: () => void
  templates: ExtractionTemplate[]
  defaultTemplateId: number | 'auto'
  languages: string[]
  decimals: number
  defaultTax: { taxBps: number; taxName: string }
  currency: string
}

export function BatchImportDialog({ open, onClose, templates, defaultTemplateId, languages, decimals, defaultTax, currency }: Props) {
  const { t } = useTranslation()
  const openTab = useTabs((s) => s.open)
  const [rows, setRows] = useState<Row[]>([])
  const [templateId, setTemplateId] = useState<number | 'auto'>(defaultTemplateId)
  const [running, setRunning] = useState(false)

  const pick = async () => {
    const paths = await invoke('dialog:open-files', { filters: [{ name: 'PDF', extensions: ['pdf'] }], multiple: true })
    if (paths.length) setRows((cur) => [...cur, ...paths.filter((p) => !cur.some((r) => r.path === p)).map((p) => ({ path: p, status: 'pending' as const }))])
  }
  const update = (path: string, patch: Partial<Row>) => setRows((cur) => cur.map((r) => (r.path === path ? { ...r, ...patch } : r)))

  const processOne = async (row: Row) => {
    update(row.path, { status: 'processing', message: undefined })
    let engine: PdfEngine | null = null
    try {
      const file = await invoke('file:read', { path: row.path })
      engine = await PdfEngine.load(file.data)
      const infos = await engine.pageInfos()
      const spans: Span[][] = []
      const scanned = await engine.isScanned(0)
      for (let i = 0; i < infos.length; i++) {
        let s: Span[] = await engine.textSpans(i)
        if (i === 0 && scanned && languages.length) s = (await ocrPage(engine, 0, languages)).spans
        spans.push(s)
      }
      const sizes = infos.map((p) => ({ w: p.widthPt, h: p.heightPt }))
      let def: ExtractionDefinition | null = null
      if (templateId !== 'auto') def = templates.find((x) => x.id === templateId)?.definition ?? null
      else {
        const text = groupLines(spans[0]).map(lineLogicalText).join('\n')
        const best = templates.map((x) => ({ x, score: templateScore(text, x.definition.keywords) })).sort((a, b) => b.score - a.score)[0]
        if (best && best.score >= 0.6) def = best.x.definition
      }
      const inv = def ? extractWithDefinition(spans, sizes, def) : autoExtract(spans, decimals)
      const prefill = toInvoicePrefill(inv, defaultTax)
      if (!prefill.items.length) return update(row.path, { status: 'skipped', message: t('imp.warn.no_items') })
      if (!prefill.header.customerSnapshot) return update(row.path, { status: 'skipped', message: t('imp.warn.missing_customer') })
      const doc = await invoke('documents:register', { path: row.path, title: baseName(row.path), pageCount: infos.length, sizeBytes: file.sizeBytes, isScanned: scanned })
      const saved = await invoke('invoices:save', {
        docType: 'invoice', status: 'draft', customerId: null, customerSnapshot: prefill.header.customerSnapshot,
        issueDate: prefill.header.issueDate ?? new Date().toISOString().slice(0, 10), dueDate: prefill.header.dueDate ?? null,
        reference: prefill.header.reference, notes: prefill.header.notes, currency, items: prefill.items, source: 'pdf_import', sourceDocumentId: doc.id
      })
      update(row.path, { status: 'done', invoiceId: saved.id, number: saved.number, message: inv.warnings.length ? inv.warnings.map((w) => t(`imp.warn.${w.code}`, w.params)).join(' · ') : undefined })
    } catch (e) {
      update(row.path, { status: 'failed', message: e instanceof Error ? e.message : String(e) })
    } finally {
      engine?.destroy()
    }
  }

  const run = async () => {
    setRunning(true)
    try {
      const pending = rows.filter((r) => r.status === 'pending' || r.status === 'failed')
      for (const row of pending) await processOne(row)
      const done = rows.length
      notify.success('imp.created', { count: done })
    } finally {
      setRunning(false)
    }
  }

  const doneCount = rows.filter((r) => r.status === 'done').length
  const processed = rows.filter((r) => r.status !== 'pending' && r.status !== 'processing').length

  return (
    <Dialog open={open} onClose={() => !running && onClose()} title={t('imp.batchTitle')} width="max-w-3xl"
      footer={
        <>
          <span className="me-auto text-xs text-muted">{running ? t('imp.processing', { done: processed, total: rows.length }) : doneCount ? t('imp.created', { count: doneCount }) : t('imp.batchHint')}</span>
          <Button variant="ghost" disabled={running} onClick={onClose}>{t('common.close')}</Button>
          <Button variant="primary" icon={<Play className="h-3.5 w-3.5" />} loading={running} disabled={!rows.some((r) => r.status === 'pending' || r.status === 'failed')} onClick={() => void run()}>{t('imp.startBatch')}</Button>
        </>
      }>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="sm" icon={<FolderOpen className="h-4 w-4" />} disabled={running} onClick={() => void pick()}>{t('imp.pickFiles')}</Button>
        <Select value={String(templateId)} onChange={(e) => setTemplateId(e.target.value === 'auto' ? 'auto' : Number(e.target.value))} className="w-64" disabled={running}>
          <option value="auto">{t('imp.auto')}</option>
          {templates.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </Select>
      </div>
      <div className="max-h-[50vh] overflow-auto rounded-md border border-border">
        {rows.length === 0 ? <div className="p-6 text-center text-sm text-muted">{t('imp.pickFiles')}</div> : (
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 bg-surface-2 text-[11px] text-muted"><tr><th className="px-3 py-1.5 text-start">{t('imp.source')}</th><th className="px-3 py-1.5 text-start">{t('status.draft')}</th><th className="px-3 py-1.5 text-start">{t('imp.results')}</th></tr></thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.path} className={clsx(r.status === 'processing' && 'bg-accent/5')}>
                  <td className="px-3 py-2"><div className="flex items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-danger" /><span className="truncate ltr-text" dir="ltr" title={r.path}>{baseName(r.path)}</span></div></td>
                  <td className="px-3 py-2">
                    {r.status === 'done' ? <Badge tone="success">{r.number}</Badge> : r.status === 'failed' ? <Badge tone="danger">{t('imp.failed')}</Badge> : r.status === 'skipped' ? <Badge tone="warning">{t('imp.skipped')}</Badge> : r.status === 'processing' ? <Badge tone="info">…</Badge> : <Badge>{t('imp.ready')}</Badge>}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    <div className="flex items-center gap-2">
                      {r.status === 'done' ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : r.status === 'failed' || r.status === 'skipped' ? <XCircle className="h-3.5 w-3.5 text-warning" /> : null}
                      <span className="truncate">{r.message ?? ''}</span>
                      {r.invoiceId && <Button size="sm" variant="ghost" onClick={() => openTab({ id: `invoice-${r.invoiceId}`, kind: 'invoice', title: r.number ?? '', params: { id: r.invoiceId } })}>{t('common.open')}</Button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Dialog>
  )
}
