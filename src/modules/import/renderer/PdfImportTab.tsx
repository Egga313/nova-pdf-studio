/**
 * PDF → فاتورة ذكية: الصفحة على جهة، وبيانات مستخرجة قابلة للتعديل على الجهة الأخرى.
 * الكشف تلقائي أو بقالب استخراج (مناطق مرسومة بالسحب + أعمدة البنود)، مع تحقق حسابي، حفظ القالب، إنشاء الفاتورة، واستيراد جماعي.
 */
import { clsx } from 'clsx'
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Layers, Plus, Receipt, RefreshCw, Save, ScanText, Trash2, Wand2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ExtractedField, ExtractedInvoice, ExtractionDefinition, ExtractionTemplate, ItemColumn, Rect, Zone, ZoneField } from '@shared/extraction'
import { AMOUNT_FIELDS, DATE_FIELDS, ITEM_COLUMNS, ZONE_FIELDS } from '@shared/extraction'
import { customerDisplayName, type InvoiceItemInput } from '@shared/invoicing'
import { minorToDecimalString, parseMinor, parsePercent, parseQuantity } from '@shared/money'
import { ocrPage } from '@modules/ocr/renderer/ocrClient'
import { PdfEngine, type PageInfo } from '@modules/pdf/renderer/pdfEngine'
import { baseName } from '@renderer/app/openFile'
import type { TabComponentProps } from '@renderer/app/tabRegistry'
import { Badge, Button, Input, Select, Spinner, Switch } from '@renderer/components/ui'
import { fmtMoney } from '@renderer/lib/format'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'
import { useSettings } from '@renderer/stores/settings'
import { useTabs } from '@renderer/stores/tabs'
import { autoExtract, detectZoneColumns, extractWithDefinition, groupLines, itemTotalMinor, lineLogicalText, suggestKeywords, templateScore, toInvoicePrefill, type Span } from '../shared/extract'
import { BatchImportDialog } from './BatchImportDialog'

interface EditableItem {
  key: string
  name: string
  description: string
  qty: string
  price: string
  disc: string
  tax: string
  totalMinor: number | null
}

const FIELD_ORDER: ZoneField[] = ZONE_FIELDS.filter((f) => f !== 'items')
const FIELD_COLORS: Record<string, string> = {
  number: '#4f46e5', issueDate: '#0891b2', dueDate: '#0e7490', reference: '#7c3aed', customerName: '#db2777', customerPhone: '#be185d', customerAddress: '#9d174d', customerTaxId: '#831843',
  subtotal: '#d97706', discount: '#b45309', tax: '#ea580c', total: '#dc2626', notes: '#64748b', items: '#059669'
}

let seq = 0
const newId = () => `z-${Date.now().toString(36)}-${(seq++).toString(36)}`

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

export function PdfImportTab({ tab }: TabComponentProps) {
  const { t } = useTranslation()
  const settings = useSettings((s) => s.settings)
  const taxes = useSettings((s) => s.taxes)
  const currencies = useSettings((s) => s.currencies)
  const openTab = useTabs((s) => s.open)
  const path = (tab.params.path as string | null | undefined) ?? null
  const initialBytes = tab.params.bytes as Uint8Array | undefined
  const fileName = (tab.params.name as string | undefined) ?? (path ? baseName(path) : 'document.pdf')
  const currency = settings.invoice.defaultCurrency
  const decimals = currencies.find((c) => c.code === currency)?.decimals ?? 2
  const defaultTax = useMemo(() => {
    const tx = taxes.find((x) => x.id === settings.invoice.defaultTaxId) ?? taxes.find((x) => x.isDefault)
    return { taxBps: tx?.rateBps ?? 0, taxName: tx?.name ?? '' }
  }, [taxes, settings.invoice.defaultTaxId])

  const engineRef = useRef<PdfEngine | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [pages, setPages] = useState<PageInfo[]>([])
  const [spans, setSpans] = useState<Span[][]>([])
  const [scanned, setScanned] = useState<boolean[]>([])
  const [pageIdx, setPageIdx] = useState(0)
  const [ocrBusy, setOcrBusy] = useState(false)
  const [documentId, setDocumentId] = useState<number | null>(null)
  const [templates, setTemplates] = useState<ExtractionTemplate[]>([])
  const [templateId, setTemplateId] = useState<number | 'auto'>('auto')
  const [matchedName, setMatchedName] = useState<string | null>(null)
  const [zones, setZones] = useState<Zone[]>([])
  const [selectedZone, setSelectedZone] = useState<string | null>(null)
  const [fields, setFields] = useState<Partial<Record<ZoneField, string>>>({})
  const [meta, setMeta] = useState<Partial<Record<ZoneField, ExtractedField>>>({})
  const [items, setItems] = useState<EditableItem[]>([])
  const [warnings, setWarnings] = useState<ExtractedInvoice['warnings']>([])
  const [templateName, setTemplateName] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [batchOpen, setBatchOpen] = useState(false)
  const [customerMatch, setCustomerMatch] = useState<{ id: number; name: string } | null>(null)

  const pageSizes = useMemo(() => pages.map((p) => ({ w: p.widthPt, h: p.heightPt })), [pages])

  const applyExtracted = useCallback((inv: ExtractedInvoice) => {
    const f: Partial<Record<ZoneField, string>> = {}
    for (const k of FIELD_ORDER) if (inv.fields[k]) f[k] = inv.fields[k]!.value
    setFields(f)
    setMeta(inv.fields)
    setItems(inv.items.map((it, i) => ({
      key: `it-${i}-${Date.now().toString(36)}`, name: it.name, description: it.description,
      qty: String(it.quantityMilli / 1000), price: minorToDecimalString(it.unitPriceMinor, decimals),
      disc: String(it.discountBps / 100), tax: String(it.taxBps / 100), totalMinor: it.totalMinor
    })))
    setWarnings(inv.warnings)
  }, [decimals])

  const runExtraction = useCallback((def: ExtractionDefinition | null, pageSpans = spans, sizes = pageSizes) => {
    if (!pageSpans.length) return
    const inv = def ? extractWithDefinition(pageSpans, sizes, def) : autoExtract(pageSpans, decimals)
    applyExtracted(inv)
  }, [spans, pageSizes, decimals, applyExtracted])

  // ---- تحميل الملف والنص وOCR والقوالب ----
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const bytes = initialBytes ?? (await invoke('file:read', { path: path! })).data
        const engine = await PdfEngine.load(bytes)
        engineRef.current = engine
        const infos = await engine.pageInfos()
        const sp: Span[][] = []
        const sc: boolean[] = []
        for (let i = 0; i < infos.length; i++) {
          sp.push(await engine.textSpans(i))
          sc.push(await engine.isScanned(i))
        }
        if (sc[0] && settings.ocr.languages.length) {
          setOcrBusy(true)
          try {
            const res = await ocrPage(engine, 0, settings.ocr.languages)
            engine.setOcrSpans(0, res.spans)
            sp[0] = res.spans
          } catch (e) {
            notify.error(e, 'ocr.failed')
          } finally {
            setOcrBusy(false)
          }
        }
        if (cancelled) return
        setPages(infos)
        setSpans(sp)
        setScanned(sc)
        const list = await invoke('extraction:list').catch(() => [] as ExtractionTemplate[])
        setTemplates(list)
        const sizes = infos.map((p) => ({ w: p.widthPt, h: p.heightPt }))
        const text = groupLines(sp[0] ?? []).map(lineLogicalText).join('\n')
        const best = list.map((x) => ({ x, score: templateScore(text, x.definition.keywords) })).sort((a, b) => b.score - a.score)[0]
        if (best && best.score >= 0.6) {
          setTemplateId(best.x.id)
          setZones(best.x.definition.zones)
          setTemplateName(best.x.name)
          setMatchedName(best.x.name)
          const inv = extractWithDefinition(sp, sizes, best.x.definition)
          applyExtracted(inv)
          notify.info('imp.matched', { name: best.x.name })
        } else applyExtracted(autoExtract(sp, decimals))
        if (path) invoke('documents:register', { path, title: fileName, pageCount: infos.length, sizeBytes: bytes.byteLength, isScanned: sc[0] }).then((d) => setDocumentId(d.id)).catch(() => undefined)
        setStatus('ready')
      } catch (e) {
        notify.error(e)
        setStatus('error')
      }
    })()
    return () => {
      cancelled = true
      engineRef.current?.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- مطابقة العميل ----
  useEffect(() => {
    const phone = fields.customerPhone?.replace(/\D/g, '')
    const name = fields.customerName?.trim()
    if (!phone && !name) {
      setCustomerMatch(null)
      return
    }
    const h = setTimeout(() => {
      invoke('customers:search', { query: phone && phone.length >= 6 ? phone : name!, limit: 3 }).then((list) => {
        const hit = list.find((c) => (phone && c.phone?.replace(/\D/g, '').includes(phone)) || (name && customerDisplayName(c).toLowerCase() === name.toLowerCase())) ?? (phone && list.length === 1 ? list[0] : undefined)
        setCustomerMatch(hit ? { id: hit.id, name: customerDisplayName(hit) } : null)
      }).catch(() => setCustomerMatch(null))
    }, 250)
    return () => clearTimeout(h)
  }, [fields.customerPhone, fields.customerName])

  // ---- تصيير الصفحة ----
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const paneRef = useRef<HTMLDivElement>(null)
  const [paneW, setPaneW] = useState(600)
  useEffect(() => {
    const el = paneRef.current
    if (!el) return
    const ro = new ResizeObserver(() => requestAnimationFrame(() => setPaneW(el.clientWidth)))
    ro.observe(el)
    setPaneW(el.clientWidth)
    return () => ro.disconnect()
  }, [status])
  const page = pages[pageIdx]
  const scale = page ? Math.max(0.2, (paneW - 32) / page.widthPt) : 1
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || !page || !canvasRef.current) return
    let cancel: (() => void) | null = null
    engine.render(pageIdx, canvasRef.current, scale, 0).then((r) => { cancel = r.cancel }).catch(() => undefined)
    return () => cancel?.()
  }, [pageIdx, scale, page, status])

  // ---- رسم المناطق ----
  const overlayRef = useRef<HTMLDivElement>(null)
  const [drawing, setDrawing] = useState<Rect | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const toFraction = (e: React.PointerEvent) => {
    const r = overlayRef.current!.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
  }
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).dataset.zone) return
    e.preventDefault()
    startRef.current = toFraction(e)
    setDrawing({ ...startRef.current, w: 0, h: 0 })
    try {
      overlayRef.current?.setPointerCapture(e.pointerId)
    } catch {
      /* أحداث مصنّعة بلا مؤشر فعلي */
    }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!startRef.current) return
    const p = toFraction(e)
    const s = startRef.current
    setDrawing({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) })
  }
  const onPointerUp = () => {
    if (!startRef.current || !drawing) return
    startRef.current = null
    if (drawing.w > 0.01 && drawing.h > 0.005) {
      const used = new Set(zones.map((z) => z.field))
      const field = (['number', 'issueDate', 'customerName', 'total', 'items'] as ZoneField[]).find((f) => !used.has(f)) ?? 'notes'
      const zone: Zone = { id: newId(), field, page: pageIdx, rect: drawing }
      setZones((z) => [...z, zone])
      setSelectedZone(zone.id)
    }
    setDrawing(null)
  }
  const updateZone = (id: string, patch: Partial<Zone>) => setZones((z) => z.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const removeZone = (id: string) => {
    setZones((z) => z.filter((x) => x.id !== id))
    if (selectedZone === id) setSelectedZone(null)
  }
  const currentDef = (): ExtractionDefinition | null => zones.length ? { version: 1, pageWidthPt: pages[0]?.widthPt ?? 595, pageHeightPt: pages[0]?.heightPt ?? 842, zones, keywords: suggestKeywords(groupLines(spans[0] ?? [])), language: settings.language as ExtractionDefinition['language'], decimals } : null

  const applyZones = () => runExtraction(currentDef())
  const detectColumns = (zone: Zone) => {
    const cols = detectZoneColumns(spans[zone.page] ?? [], zone, pageSizes[zone.page]?.w ?? 595, pageSizes[zone.page]?.h ?? 842)
    if (!cols.length) return notify.warning('imp.noItems')
    updateZone(zone.id, { columns: cols, hasHeaderRow: true })
  }

  const selectTemplate = (value: string) => {
    if (value === 'auto') {
      setTemplateId('auto')
      setMatchedName(null)
      runExtraction(null)
      return
    }
    const tpl = templates.find((x) => x.id === Number(value))
    if (!tpl) return
    setTemplateId(tpl.id)
    setZones(tpl.definition.zones)
    setTemplateName(tpl.name)
    setMatchedName(null)
    runExtraction(tpl.definition)
  }

  const saveTemplate = async () => {
    const def = currentDef()
    if (!def) return notify.warning('imp.noZones')
    if (!templateName.trim()) return notify.warning('imp.templateName')
    setSavingTemplate(true)
    try {
      const saved = await invoke('extraction:save', { id: templateId === 'auto' ? undefined : templateId, name: templateName.trim(), definition: def, sourceDocumentId: documentId })
      setTemplates(await invoke('extraction:list'))
      setTemplateId(saved.id)
      notify.success('imp.templateSaved', { name: saved.name })
    } catch (e) {
      notify.error(e)
    } finally {
      setSavingTemplate(false)
    }
  }
  const deleteTemplate = async () => {
    if (templateId === 'auto') return
    if (!window.confirm(t('imp.deleteTemplate') + '?')) return
    await invoke('extraction:delete', { id: templateId })
    setTemplates(await invoke('extraction:list'))
    setTemplateId('auto')
    setZones([])
  }

  const rerunOcr = async () => {
    const engine = engineRef.current
    if (!engine) return
    setOcrBusy(true)
    try {
      const res = await ocrPage(engine, pageIdx, settings.ocr.languages)
      engine.setOcrSpans(pageIdx, res.spans)
      const next = spans.map((s, i) => (i === pageIdx ? res.spans : s))
      setSpans(next)
      setScanned((sc) => sc.map((v, i) => (i === pageIdx ? false : v)))
      runExtraction(templateId === 'auto' ? null : templates.find((x) => x.id === templateId)?.definition ?? null, next)
    } catch (e) {
      notify.error(e, 'ocr.failed')
    } finally {
      setOcrBusy(false)
    }
  }

  // ---- البنود والتحقق الحي ----
  const toInput = (it: EditableItem): InvoiceItemInput => {
    const taxBps = safe(() => parsePercent(it.tax || '0'), 0)
    return {
      name: it.name, description: it.description, quantityMilli: safe(() => parseQuantity(it.qty || '1'), 1000) || 1000,
      unitPriceMinor: safe(() => parseMinor(it.price || '0', decimals), 0), discountBps: safe(() => parsePercent(it.disc || '0'), 0),
      taxBps: taxBps || defaultTax.taxBps, taxName: taxBps ? `${taxBps / 100}%` : defaultTax.taxName, productId: null
    }
  }
  const computedTotal = useMemo(() => items.reduce((sum, it) => {
    const inp = toInput(it)
    return sum + itemTotalMinor({ quantityMilli: inp.quantityMilli, unitPriceMinor: inp.unitPriceMinor, discountBps: inp.discountBps, taxBps: safe(() => parsePercent(it.tax || '0'), 0) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, 0), [items, decimals])
  const extractedTotal = fields.total ? safe(() => parseMinor(fields.total!, decimals), null as number | null) : null
  const totalsMatch = extractedTotal !== null && Math.abs(extractedTotal - computedTotal) <= items.length + 2
  const updateItem = (key: string, patch: Partial<EditableItem>) => setItems((cur) => cur.map((it) => (it.key === key ? { ...it, ...patch } : it)))

  const createInvoice = () => {
    const fake: ExtractedInvoice = { fields: meta, items: [], warnings: [], computedItemsTotalMinor: 0, pageText: '' }
    const prefill = toInvoicePrefill(fake, defaultTax)
    const header: Record<string, unknown> = {
      reference: fields.number ?? fields.reference ?? prefill.header.reference,
      issueDate: fields.issueDate && /^\d{4}-\d{2}-\d{2}$/.test(fields.issueDate) ? fields.issueDate : undefined,
      dueDate: fields.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(fields.dueDate) ? fields.dueDate : undefined,
      notes: fields.notes ?? '',
      customerId: customerMatch?.id ?? null,
      customerSnapshot: fields.customerName ? { id: customerMatch?.id ?? null, displayName: customerMatch?.name ?? fields.customerName, companyName: fields.customerName, phone: fields.customerPhone, address: fields.customerAddress, taxId: fields.customerTaxId } : null,
      source: 'pdf_import',
      sourceDocumentId: documentId
    }
    openTab({ kind: 'invoice', title: 't:commands.newInvoice', params: { id: null, prefillItems: items.map(toInput), prefillHeader: header, source: 'pdf_import' } })
  }

  if (status === 'loading') return <div className="flex h-full items-center justify-center gap-3 text-sm text-muted"><Spinner />{ocrBusy ? t('imp.ocrRunning') : t('common.loading')}</div>
  if (status === 'error') return <div className="flex h-full items-center justify-center text-sm text-danger">{t('errors.PDF_CORRUPTED')}</div>

  const selected = zones.find((z) => z.id === selectedZone) ?? null
  const pageZones = zones.filter((z) => z.page === pageIdx)

  return (
    <div className="flex h-full flex-col">
      {/* الرأس */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2">
        <Receipt className="h-4 w-4 text-accent" />
        <div className="me-2">
          <div className="text-sm font-semibold">{t('imp.title')}</div>
          <div className="ltr-text text-[11px] text-muted" dir="ltr">{path ?? fileName}</div>
        </div>
        <Select value={String(templateId)} onChange={(e) => selectTemplate(e.target.value)} className="h-8 w-56 text-xs" aria-label={t('imp.template')}>
          <option value="auto">{t('imp.auto')}</option>
          {templates.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </Select>
        {matchedName && <Badge tone="success">{t('imp.matched', { name: matchedName })}</Badge>}
        <Button size="sm" variant="ghost" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => (zones.length ? applyZones() : runExtraction(null))}>{t('imp.reextract')}</Button>
        <Button size="sm" variant="ghost" icon={<ScanText className="h-3.5 w-3.5" />} loading={ocrBusy} onClick={() => void rerunOcr()}>{t('imp.runOcr')}</Button>
        <div className="ms-auto flex items-center gap-2">
          <Button size="sm" variant="outline" icon={<Layers className="h-3.5 w-3.5" />} onClick={() => setBatchOpen(true)}>{t('imp.batch')}</Button>
          <Button size="sm" variant="primary" icon={<Receipt className="h-3.5 w-3.5" />} disabled={!items.length && !fields.total} onClick={createInvoice}>{t('imp.createInvoice')}</Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* الصفحة والمناطق */}
        <div ref={paneRef} className="relative min-w-0 flex-1 overflow-auto bg-surface-2/50 p-4">
          {scanned[pageIdx] && !spans[pageIdx]?.length && (
            <div className="mb-3 flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs"><AlertTriangle className="h-4 w-4 text-warning" />{t('imp.ocrNeeded')}<Button size="sm" variant="primary" className="ms-auto" loading={ocrBusy} onClick={() => void rerunOcr()}>{t('imp.runOcr')}</Button></div>
          )}
          <div className="mb-2 flex items-center justify-between text-xs text-muted">
            <span>{t('imp.drawHint')}</span>
            {pages.length > 1 && (
              <span className="flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-6 w-6" disabled={pageIdx === 0} onClick={() => setPageIdx((p) => p - 1)}><ChevronRight className="h-3.5 w-3.5 rtl:hidden" /><ChevronLeft className="h-3.5 w-3.5 ltr:hidden" /></Button>
                {t('imp.page')} <b className="ltr-text">{pageIdx + 1}</b> {t('imp.of')} <b className="ltr-text">{pages.length}</b>
                <Button size="icon" variant="ghost" className="h-6 w-6" disabled={pageIdx >= pages.length - 1} onClick={() => setPageIdx((p) => p + 1)}><ChevronLeft className="h-3.5 w-3.5 rtl:hidden" /><ChevronRight className="h-3.5 w-3.5 ltr:hidden" /></Button>
              </span>
            )}
          </div>
          {page && (
            <div className="relative mx-auto bg-white shadow-pop" style={{ width: Math.floor(page.widthPt * scale), height: Math.floor(page.heightPt * scale), direction: 'ltr' }}>
              <canvas ref={canvasRef} className="block" />
              <div ref={overlayRef} className="absolute inset-0 cursor-crosshair select-none" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
                {pageZones.map((z) => (
                  <div key={z.id} data-zone="1" onPointerDown={(e) => { e.stopPropagation(); setSelectedZone(z.id) }}
                    className={clsx('absolute cursor-pointer rounded-[2px] border-2', selectedZone === z.id ? 'ring-2 ring-offset-1' : '')}
                    style={{ left: `${z.rect.x * 100}%`, top: `${z.rect.y * 100}%`, width: `${z.rect.w * 100}%`, height: `${z.rect.h * 100}%`, borderColor: FIELD_COLORS[z.field], background: `${FIELD_COLORS[z.field]}22` }}>
                    <span className="absolute -top-5 start-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium text-white" style={{ background: FIELD_COLORS[z.field] }}>{t(`imp.field.${z.field}`)}</span>
                    {z.field === 'items' && z.columns?.map((c, i) => (
                      <div key={i} className="absolute top-0 h-full border-s border-dashed border-emerald-700/70" style={{ left: `${c.x * 100}%`, width: `${c.w * 100}%` }}>
                        <span className="absolute bottom-0 start-0.5 text-[9px] text-emerald-800">{t(`imp.col.${c.column}`)}</span>
                      </div>
                    ))}
                  </div>
                ))}
                {drawing && <div className="absolute border-2 border-dashed border-accent bg-accent/10" style={{ left: `${drawing.x * 100}%`, top: `${drawing.y * 100}%`, width: `${drawing.w * 100}%`, height: `${drawing.h * 100}%` }} />}
              </div>
            </div>
          )}
        </div>

        {/* اللوحة الجانبية */}
        <aside className="flex w-[460px] shrink-0 flex-col overflow-auto border-s border-border bg-surface">
          {/* المناطق والقالب */}
          <section className="border-b border-border p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold">{t('imp.zones')} <span className="text-muted">({zones.length})</span></h3>
              <div className="flex gap-1">
                {zones.length > 0 && <Button size="sm" variant="ghost" onClick={() => { setZones([]); setSelectedZone(null) }}>{t('imp.clearZones')}</Button>}
                {zones.length > 0 && <Button size="sm" variant="secondary" icon={<Wand2 className="h-3.5 w-3.5" />} onClick={applyZones}>{t('imp.applyTemplate')}</Button>}
              </div>
            </div>
            <div className="space-y-1.5">
              {zones.map((z) => (
                <div key={z.id} className={clsx('flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs', selectedZone === z.id ? 'border-accent bg-accent/5' : 'border-border')} onClick={() => setSelectedZone(z.id)}>
                  <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: FIELD_COLORS[z.field] }} />
                  <Select value={z.field} onChange={(e) => updateZone(z.id, { field: e.target.value as ZoneField })} className="h-7 flex-1 text-xs">
                    {ZONE_FIELDS.map((f) => <option key={f} value={f}>{t(`imp.field.${f}`)}</option>)}
                  </Select>
                  <span className="text-muted ltr-text">p{z.page + 1}</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-danger" onClick={(e) => { e.stopPropagation(); removeZone(z.id) }}><X className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>
            {selected?.field === 'items' && (
              <div className="mt-3 rounded-md border border-border bg-surface-2/40 p-2 text-xs">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium">{t('imp.columns')}</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" icon={<Wand2 className="h-3 w-3" />} onClick={() => detectColumns(selected)}>{t('imp.reextract')}</Button>
                    <Button size="sm" variant="ghost" icon={<Plus className="h-3 w-3" />} onClick={() => updateZone(selected.id, { columns: [...(selected.columns ?? []), { column: 'description', x: 0, w: 0.5 }] })}>{t('imp.addColumn')}</Button>
                  </div>
                </div>
                <Switch checked={!!selected.hasHeaderRow} onChange={(v) => updateZone(selected.id, { hasHeaderRow: v })} label={t('imp.headerRow')} />
                <div className="mt-2 space-y-1">
                  {(selected.columns ?? []).map((c, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <Select value={c.column} onChange={(e) => updateZone(selected.id, { columns: selected.columns!.map((k, j) => (j === i ? { ...k, column: e.target.value as ItemColumn } : k)) })} className="h-7 flex-1 text-xs">
                        {ITEM_COLUMNS.map((col) => <option key={col} value={col}>{t(`imp.col.${col}`)}</option>)}
                      </Select>
                      <Input type="number" min={0} max={100} value={Math.round(c.x * 100)} onChange={(e) => updateZone(selected.id, { columns: selected.columns!.map((k, j) => (j === i ? { ...k, x: Number(e.target.value) / 100 } : k)) })} className="h-7 w-16 text-xs ltr-text" title="%" />
                      <Input type="number" min={1} max={100} value={Math.round(c.w * 100)} onChange={(e) => updateZone(selected.id, { columns: selected.columns!.map((k, j) => (j === i ? { ...k, w: Number(e.target.value) / 100 } : k)) })} className="h-7 w-16 text-xs ltr-text" title="%" />
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-danger" onClick={() => updateZone(selected.id, { columns: selected.columns!.filter((_, j) => j !== i) })}><X className="h-3 w-3" /></Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-3 flex items-center gap-2">
              <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder={t('imp.templateName')} className="h-8 flex-1 text-xs" />
              <Button size="sm" variant="secondary" icon={<Save className="h-3.5 w-3.5" />} loading={savingTemplate} disabled={!zones.length} onClick={() => void saveTemplate()}>{templateId === 'auto' ? t('imp.saveTemplate') : t('imp.updateTemplate')}</Button>
              {templateId !== 'auto' && <Button size="icon" variant="ghost" className="h-8 w-8 text-danger" title={t('imp.deleteTemplate')} onClick={() => void deleteTemplate()}><Trash2 className="h-3.5 w-3.5" /></Button>}
            </div>
          </section>

          {/* الحقول */}
          <section className="border-b border-border p-4">
            <h3 className="mb-2 text-[13px] font-semibold">{t('imp.fields')}</h3>
            <div className="grid grid-cols-2 gap-2">
              {FIELD_ORDER.map((f) => {
                const m = meta[f]
                return (
                  <label key={f} className={clsx('block', (f === 'customerAddress' || f === 'notes') && 'col-span-2')}>
                    <span className="mb-0.5 flex items-center gap-1 text-[11px] text-muted">
                      <span className="h-2 w-2 rounded-full" style={{ background: m ? (m.confidence >= 0.7 ? '#16a34a' : '#d97706') : '#cbd5e1' }} title={m ? `${t('imp.confidence')} ${Math.round(m.confidence * 100)}% · ${t('imp.rawValue')}: ${m.raw}` : ''} />
                      {t(`imp.field.${f}`)}
                    </span>
                    <Input
                      type={DATE_FIELDS.includes(f) && (!fields[f] || /^\d{4}-\d{2}-\d{2}$/.test(fields[f]!)) ? 'date' : 'text'}
                      value={fields[f] ?? ''}
                      onChange={(e) => setFields((cur) => ({ ...cur, [f]: e.target.value }))}
                      className={clsx('h-8 text-xs', (AMOUNT_FIELDS.includes(f) || f === 'number' || f === 'customerPhone') && 'ltr-text')}
                      dir={AMOUNT_FIELDS.includes(f) || f === 'number' || f === 'customerPhone' ? 'ltr' : 'auto'}
                    />
                  </label>
                )
              })}
            </div>
            <p className="mt-2 text-[11px] text-muted">{customerMatch ? t('imp.customerMatch', { name: customerMatch.name }) : fields.customerName ? t('imp.customerNew') : ''}</p>
          </section>

          {/* البنود */}
          <section className="border-b border-border p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold">{t('imp.items')} <span className="text-muted">({items.length})</span></h3>
              <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setItems((cur) => [...cur, { key: `it-${Date.now().toString(36)}`, name: '', description: '', qty: '1', price: '0', disc: '0', tax: String(defaultTax.taxBps / 100), totalMinor: null }])}>{t('imp.addItem')}</Button>
            </div>
            {items.length === 0 ? <p className="text-xs text-muted">{t('imp.noItems')}</p> : (
              <table className="w-full table-fixed text-xs">
                <thead className="text-[10.5px] text-muted"><tr><th className="w-[38%] text-start font-medium">{t('imp.col.description')}</th><th className="w-[13%] font-medium">{t('imp.col.qty')}</th><th className="w-[21%] font-medium">{t('imp.col.unitPrice')}</th><th className="w-[10%] font-medium">%</th><th className="w-[10%] font-medium">{t('imp.col.tax')}</th><th className="w-[8%]"></th></tr></thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.key}>
                      <td className="p-0.5"><Input value={it.name} onChange={(e) => updateItem(it.key, { name: e.target.value })} className="h-7 text-xs" dir="auto" title={it.description} /></td>
                      <td className="p-0.5"><Input value={it.qty} onChange={(e) => updateItem(it.key, { qty: e.target.value })} className="h-7 text-xs ltr-text" dir="ltr" /></td>
                      <td className="p-0.5"><Input value={it.price} onChange={(e) => updateItem(it.key, { price: e.target.value })} className="h-7 text-xs ltr-text" dir="ltr" /></td>
                      <td className="p-0.5"><Input value={it.disc} onChange={(e) => updateItem(it.key, { disc: e.target.value })} className="h-7 text-xs ltr-text" dir="ltr" /></td>
                      <td className="p-0.5"><Input value={it.tax} onChange={(e) => updateItem(it.key, { tax: e.target.value })} className="h-7 text-xs ltr-text" dir="ltr" /></td>
                      <td className="p-0.5 text-center"><button type="button" className="text-muted hover:text-danger" title={t('imp.removeItem')} onClick={() => setItems((cur) => cur.filter((x) => x.key !== it.key))}><X className="h-3.5 w-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* التحققات */}
          <section className="p-4">
            <h3 className="mb-2 text-[13px] font-semibold">{t('imp.checks')}</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md border border-border p-2"><div className="text-muted">{t('imp.totalExtracted')}</div><div className="ltr-text font-semibold">{extractedTotal !== null ? fmtMoney(extractedTotal, currency) : '—'}</div></div>
              <div className={clsx('rounded-md border p-2', totalsMatch ? 'border-success/40 bg-success/5' : 'border-border')}><div className="text-muted">{t('imp.totalComputed')}</div><div className="ltr-text font-semibold">{fmtMoney(computedTotal, currency)}</div></div>
            </div>
            <ul className="mt-2 space-y-1 text-xs">
              {totalsMatch && <li className="flex items-center gap-2 text-success"><CheckCircle2 className="h-3.5 w-3.5" />{t('imp.checkOk')}</li>}
              {!totalsMatch && extractedTotal !== null && items.length > 0 && <li className="flex items-center gap-2 text-warning"><AlertTriangle className="h-3.5 w-3.5" />{t('imp.warn.items_total_mismatch', { computed: minorToDecimalString(computedTotal, decimals), extracted: minorToDecimalString(extractedTotal, decimals) })}</li>}
              {warnings.filter((w) => w.code !== 'items_total_mismatch').map((w, i) => <li key={i} className="flex items-center gap-2 text-muted"><AlertTriangle className="h-3.5 w-3.5 text-warning" />{t(`imp.warn.${w.code}`, w.params)}</li>)}
            </ul>
          </section>
        </aside>
      </div>

      <BatchImportDialog open={batchOpen} onClose={() => setBatchOpen(false)} templates={templates} defaultTemplateId={templateId} languages={settings.ocr.languages} decimals={decimals} defaultTax={defaultTax} currency={currency} />
    </div>
  )
}
