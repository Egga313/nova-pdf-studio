/**
 * استوديو الجداول: شبكة افتراضية (virtualized) مع شريط صيغ، تنسيق، أوراق متعددة، حافظة، تراجع/إعادة،
 * حفظ في قاعدة البيانات، استيراد/تصدير Excel وCSV وPDF، طباعة، وإنشاء فاتورة من الجدول.
 */
import { clsx } from 'clsx'
import {
  AlignCenter, AlignLeft, AlignRight, Bold, ChevronDown, Combine, FileDown, FolderOpen, Italic, Plus, Printer, Receipt, Redo2, Save, Underline, Undo2, Ungroup, X
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { StoreApi } from 'zustand'
import type { InvoiceItemInput } from '@shared/invoicing'
import type { TabComponentProps } from '@renderer/app/tabRegistry'
import { Button, Input, Select } from '@renderer/components/ui'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'
import { useSettings } from '@renderer/stores/settings'
import { useTabs } from '@renderer/stores/tabs'
import { colToLetters, FUNCTION_NAMES, isFormula, refKey, refToA1 } from '../shared/formula'
import { DEFAULT_COL_WIDTH, DEFAULT_ROW_HEIGHT, formatCellValue, sheetFromMatrix, type NumberFormat, type Sheet, type Workbook } from '../shared/sheetModel'
import { InvoiceMappingDialog } from './InvoiceMappingDialog'
import { renderSheetHtml } from './sheetHtml'
import { createWorkbookStore, expandToMerges, type Range, selectionStats, selRange, sheetOf, useWorkbook, type WorkbookState } from './useWorkbook'

const HEADER_W = 46
const HEADER_H = 26
const FORMATS: NumberFormat[] = ['general', 'number', 'currency', 'percent', 'date', 'text']

interface ContextMenuState { x: number; y: number; col: number; row: number }

export function SpreadsheetTab({ tab }: TabComponentProps) {
  const { t, i18n } = useTranslation()
  const settings = useSettings((s) => s.settings)
  const taxes = useSettings((s) => s.taxes)
  const currencies = useSettings((s) => s.currencies)
  const { setDirty, setTitle: setTabTitle, open: openTab } = useTabs()
  const rtl = i18n.dir() === 'rtl'
  const currency = settings.invoice.defaultCurrency
  const decimals = currencies.find((c) => c.code === currency)?.decimals ?? 2

  const storeRef = useRef<StoreApi<WorkbookState> | null>(null)
  if (!storeRef.current) storeRef.current = createWorkbookStore({ title: t('sheet.untitled') })
  const store = storeRef.current
  const wb = useWorkbook(store, (s) => s.wb)
  const title = useWorkbook(store, (s) => s.title)
  const dirty = useWorkbook(store, (s) => s.dirty)
  const anchor = useWorkbook(store, (s) => s.anchor)
  const focus = useWorkbook(store, (s) => s.focus)
  const editing = useWorkbook(store, (s) => s.editing)
  const canUndo = useWorkbook(store, (s) => s.past.length > 0)
  const canRedo = useWorkbook(store, (s) => s.future.length > 0)
  const sheet = sheetOf({ wb })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)

  const defaultTax = useMemo(() => {
    const tx = taxes.find((x) => x.id === settings.invoice.defaultTaxId) ?? taxes.find((x) => x.isDefault)
    return { taxBps: tx?.rateBps ?? 0, taxName: tx?.name ?? '' }
  }, [taxes, settings.invoice.defaultTaxId])

  // ---- تحميل حسب معاملات التبويب ----
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const id = tab.params.id as number | undefined
        const path = tab.params.path as string | null | undefined
        const fromInvoice = tab.params.fromInvoice as { number: string; items: InvoiceItemInput[] } | undefined
        if (id) {
          const rec = await invoke('spreadsheets:get', { id })
          if (!rec) throw new Error('not found')
          if (!cancelled) {
            store.getState().load(JSON.parse(rec.data) as Workbook, { title: rec.title, recordId: rec.id, filePath: rec.path })
            setTabTitle(tab.id, rec.title)
          }
        } else if (path) {
          const imported = await invoke('spreadsheets:import-file', { path })
          if (!cancelled) {
            store.getState().load(JSON.parse(imported.data) as Workbook, { title: imported.title, filePath: path, recordId: null })
            setTabTitle(tab.id, imported.title)
            notify.success('sheet.imported', { name: imported.title })
          }
        } else if (fromInvoice) {
          const head = [t('sheet.colRef'), t('sheet.colDescription'), t('sheet.colQty'), t('sheet.colPrice'), t('sheet.colDiscount'), t('sheet.colTax'), t('common.total')]
          const rows = fromInvoice.items.map((it, i) => {
            const r = i + 2
            return [it.description ?? '', it.name, it.quantityMilli / 1000, it.unitPriceMinor / 10 ** decimals, it.discountBps / 100, it.taxBps / 100, `=ROUND(C${r}*D${r}*(1-E${r}/100)*(1+F${r}/100),${decimals})`]
          })
          const sumRow = ['', '', '', '', '', t('sheet.sum'), `=SUM(G2:G${rows.length + 1})`]
          const s = sheetFromMatrix(fromInvoice.number || 'Invoice', [head, ...rows, sumRow])
          s.colWidths = { 0: 90, 1: 260, 2: 80, 3: 110, 4: 80, 5: 80, 6: 120 }
          for (let c = 0; c < head.length; c++) s.cells[`${c}:0`] = { ...(s.cells[`${c}:0`] ?? { input: head[c], value: head[c] }), style: { bold: true, background: '#eef2ff' } }
          for (let r = 1; r <= rows.length + 1; r++) s.cells[`6:${r}`] = { ...(s.cells[`6:${r}`] ?? { input: '', value: null }), style: { format: 'number', decimals } }
          const name = t('sheet.invoiceItemsTitle', { number: fromInvoice.number })
          if (!cancelled) {
            store.getState().load({ sheets: [s], activeSheet: 0 }, { title: name, recordId: null, filePath: null })
            setTabTitle(tab.id, name)
          }
        } else {
          store.getState().load({ sheets: [sheetFromMatrix('Sheet1', [])], activeSheet: 0 }, { title: t('sheet.untitled'), recordId: null, filePath: null })
        }
      } catch (e) {
        notify.error(e, 'sheet.importFailed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.params.id, tab.params.path])

  useEffect(() => setDirty(tab.id, dirty), [dirty, tab.id, setDirty])

  // ---- حفظ/تصدير/طباعة ----
  const save = useCallback(async () => {
    const s = store.getState()
    setSaving(true)
    try {
      const rec = await invoke('spreadsheets:save', { id: s.recordId ?? undefined, title: s.title, path: s.filePath, data: JSON.stringify(s.wb), sheetCount: s.wb.sheets.length })
      s.markSaved({ recordId: rec.id, title: rec.title })
      setTabTitle(tab.id, rec.title)
      notify.success('sheet.saved')
    } catch (e) {
      notify.error(e)
    } finally {
      setSaving(false)
    }
  }, [store, tab.id, setTabTitle])

  const safeName = (ext: string) => `${(title || 'sheet').replace(/[\\/:*?"<>|]+/g, '-')}.${ext}`
  const exportFile = async (type: 'xlsx' | 'csv') => {
    setExportOpen(false)
    try {
      const p = await invoke('dialog:save-file', { defaultPath: safeName(type), filters: [{ name: type.toUpperCase(), extensions: [type] }] })
      if (!p) return
      await invoke('spreadsheets:export-file', { path: p, data: JSON.stringify(store.getState().wb), bookType: type })
      notify.success('sheet.exported', { name: p.split(/[\\/]/).pop() ?? p })
    } catch (e) {
      notify.error(e)
    }
  }
  const htmlOf = () => renderSheetHtml(sheet, { title, locale: i18n.language, currency, rtl, headers: false })
  const exportPdf = async () => {
    setExportOpen(false)
    try {
      const p = await invoke('dialog:save-file', { defaultPath: safeName('pdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }] })
      if (!p) return
      const { html, landscape } = htmlOf()
      await invoke('print:html-to-pdf', { html, outputPath: p, paperSize: 'A4', landscape, marginsMm: 10, printBackground: true })
      notify.success('sheet.exported', { name: p.split(/[\\/]/).pop() ?? p })
    } catch (e) {
      notify.error(e)
    }
  }
  const print = async () => {
    try {
      const { html, landscape } = htmlOf()
      await invoke('print:html', { html, title, paperSize: 'A4', landscape, marginsMm: 10 })
    } catch (e) {
      notify.error(e)
    }
  }
  // Ctrl+P / أمر الطباعة العام عندما يكون هذا التبويب نشطًا
  useEffect(() => {
    const onPrint = () => {
      if (useTabs.getState().activeId === tab.id) void print()
    }
    window.addEventListener('nova:print', onPrint)
    return () => window.removeEventListener('nova:print', onPrint)
  })
  const importInto = async () => {
    try {
      const paths = await invoke('dialog:open-files', { filters: [{ name: 'Spreadsheet', extensions: ['xlsx', 'xls', 'csv'] }], multiple: false })
      if (!paths[0]) return
      const imported = await invoke('spreadsheets:import-file', { path: paths[0] })
      store.getState().load(JSON.parse(imported.data) as Workbook, { title: imported.title, filePath: paths[0], recordId: store.getState().recordId })
      setTabTitle(tab.id, imported.title)
      notify.success('sheet.imported', { name: imported.title })
    } catch (e) {
      notify.error(e)
    }
  }

  // Ctrl+S على مستوى التبويب
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useTabs.getState().activeId !== tab.id) return
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save, tab.id])

  const activeCell = sheet.cells[refKey(anchor)]
  const st = activeCell?.style ?? {}
  const range = expandToMerges(sheet, selRange(anchor, focus))
  const stats = selectionStats(sheet, range)
  const nf = new Intl.NumberFormat(`${i18n.language}-u-nu-latn`, { maximumFractionDigits: 2 })
  const formulaValue = editing ?? activeCell?.input ?? ''
  const isMergedAnchor = sheet.merges.some((m) => m.col === anchor.col && m.row === anchor.row)

  const createInvoice = (items: InvoiceItemInput[]) => {
    setMapOpen(false)
    openTab({ kind: 'invoice', title: 't:commands.newInvoice', params: { id: null, prefillItems: items, source: 'spreadsheet' } })
  }

  const menuItems = menu
    ? [
        { key: 'insertRowAbove', run: () => store.getState().insertRows(menu.row, 1) },
        { key: 'insertRowBelow', run: () => store.getState().insertRows(menu.row + 1, 1) },
        { key: 'deleteRow', run: () => store.getState().deleteRows(range.r0, range.r1 - range.r0 + 1), danger: true },
        { key: 'sep1' },
        { key: 'insertColStart', run: () => store.getState().insertCols(menu.col, 1) },
        { key: 'insertColEnd', run: () => store.getState().insertCols(menu.col + 1, 1) },
        { key: 'deleteCol', run: () => store.getState().deleteCols(range.c0, range.c1 - range.c0 + 1), danger: true },
        { key: 'sep2' },
        { key: isMergedAnchor ? 'unmerge' : 'merge', run: () => (isMergedAnchor ? store.getState().unmerge() : store.getState().merge()) },
        { key: 'sep3' },
        { key: 'cut', run: () => void navigator.clipboard.writeText(store.getState().copy(true)) },
        { key: 'copy', run: () => void navigator.clipboard.writeText(store.getState().copy(false)) },
        { key: 'paste', run: () => void navigator.clipboard.readText().then((txt) => txt && store.getState().paste(txt)) },
        { key: 'clear', run: () => store.getState().clearSelection() }
      ]
    : []

  return (
    <div className="flex h-full flex-col bg-bg" onClick={() => { setMenu(null); setExportOpen(false) }}>
      {/* شريط الأدوات */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-surface px-3 py-1.5">
        <Input value={title} onChange={(e) => store.getState().setTitle(e.target.value)} onBlur={() => setTabTitle(tab.id, store.getState().title)} className="h-8 w-56 font-medium" aria-label={t('sheet.titleLabel')} />
        <Button size="sm" variant="primary" icon={<Save className="h-3.5 w-3.5" />} loading={saving} onClick={() => void save()}>{t('sheet.save')}</Button>
        <Button size="sm" variant="ghost" icon={<FolderOpen className="h-3.5 w-3.5" />} onClick={() => void importInto()}>{t('sheet.import')}</Button>
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost" icon={<FileDown className="h-3.5 w-3.5" />} onClick={() => setExportOpen((v) => !v)}>{t('sheet.export')}<ChevronDown className="h-3 w-3" /></Button>
          {exportOpen && (
            <div className="absolute start-0 top-full z-40 mt-1 w-52 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-pop">
              <button className="block w-full px-3 py-1.5 text-start text-xs hover:bg-surface-2" onClick={() => void exportFile('xlsx')}>{t('sheet.exportXlsx')}</button>
              <button className="block w-full px-3 py-1.5 text-start text-xs hover:bg-surface-2" onClick={() => void exportFile('csv')}>{t('sheet.exportCsv')}</button>
              <button className="block w-full px-3 py-1.5 text-start text-xs hover:bg-surface-2" onClick={() => void exportPdf()}>{t('sheet.exportPdf')}</button>
            </div>
          )}
        </div>
        <Button size="sm" variant="ghost" icon={<Printer className="h-3.5 w-3.5" />} onClick={() => void print()}>{t('sheet.print')}</Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <Button size="icon" variant="ghost" className="h-8 w-8" title={t('sheet.undo')} disabled={!canUndo} onClick={() => store.getState().undo()}><Undo2 className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" title={t('sheet.redo')} disabled={!canRedo} onClick={() => store.getState().redo()}><Redo2 className="h-4 w-4" /></Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToggleBtn active={!!st.bold} title={t('sheet.bold')} onClick={() => store.getState().toggleStyle('bold')}><Bold className="h-4 w-4" /></ToggleBtn>
        <ToggleBtn active={!!st.italic} title={t('sheet.italic')} onClick={() => store.getState().toggleStyle('italic')}><Italic className="h-4 w-4" /></ToggleBtn>
        <ToggleBtn active={!!st.underline} title={t('sheet.underline')} onClick={() => store.getState().toggleStyle('underline')}><Underline className="h-4 w-4" /></ToggleBtn>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToggleBtn active={st.align === 'start'} title={t('sheet.alignStart')} onClick={() => store.getState().applyStyle({ align: 'start' })}>{rtl ? <AlignRight className="h-4 w-4" /> : <AlignLeft className="h-4 w-4" />}</ToggleBtn>
        <ToggleBtn active={st.align === 'center'} title={t('sheet.alignCenter')} onClick={() => store.getState().applyStyle({ align: 'center' })}><AlignCenter className="h-4 w-4" /></ToggleBtn>
        <ToggleBtn active={st.align === 'end'} title={t('sheet.alignEnd')} onClick={() => store.getState().applyStyle({ align: 'end' })}>{rtl ? <AlignLeft className="h-4 w-4" /> : <AlignRight className="h-4 w-4" />}</ToggleBtn>
        <span className="mx-1 h-5 w-px bg-border" />
        <Select value={st.format ?? 'general'} onChange={(e) => store.getState().applyStyle({ format: e.target.value as NumberFormat })} className="h-8 w-32 text-xs" aria-label={t('sheet.format')}>
          {FORMATS.map((f) => <option key={f} value={f}>{t(`sheet.fmt${f[0].toUpperCase()}${f.slice(1)}`)}</option>)}
        </Select>
        <Button size="sm" variant="ghost" className="px-2 font-mono text-[11px]" title={t('sheet.decimalsLess')} onClick={() => store.getState().applyStyle({ decimals: Math.max(0, (st.decimals ?? 2) - 1), format: st.format === 'general' || !st.format ? 'number' : st.format })}>.0</Button>
        <Button size="sm" variant="ghost" className="px-2 font-mono text-[11px]" title={t('sheet.decimalsMore')} onClick={() => store.getState().applyStyle({ decimals: Math.min(6, (st.decimals ?? 2) + 1), format: st.format === 'general' || !st.format ? 'number' : st.format })}>.00</Button>
        <label className="relative inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-surface-2" title={t('sheet.fill')}>
          <span className="h-4 w-4 rounded-sm border border-border" style={{ background: st.background ?? 'transparent' }} />
          <input type="color" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" value={st.background ?? '#ffffff'} onChange={(e) => store.getState().applyStyle({ background: e.target.value })} />
        </label>
        <label className="relative inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-surface-2" title={t('sheet.textColor')}>
          <span className="text-sm font-semibold" style={{ color: st.color ?? 'currentColor' }}>A</span>
          <input type="color" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" value={st.color ?? '#000000'} onChange={(e) => store.getState().applyStyle({ color: e.target.value })} />
        </label>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToggleBtn active={false} title={isMergedAnchor ? t('sheet.unmerge') : t('sheet.merge')} onClick={() => (isMergedAnchor ? store.getState().unmerge() : store.getState().merge())}>{isMergedAnchor ? <Ungroup className="h-4 w-4" /> : <Combine className="h-4 w-4" />}</ToggleBtn>
        <div className="ms-auto flex items-center gap-1">
          <Button size="sm" variant="outline" icon={<Receipt className="h-3.5 w-3.5" />} onClick={() => setMapOpen(true)}>{t('sheet.toInvoice')}</Button>
        </div>
      </div>

      {/* شريط الصيغة */}
      <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-1">
        <div className="ltr-text w-20 rounded border border-border bg-surface-2 px-2 py-1 text-center font-mono text-xs">{refToA1(anchor)}</div>
        <span className="text-xs italic text-muted">fx</span>
        <input
          className="ltr-text h-7 flex-1 rounded border border-border bg-surface px-2 font-mono text-xs outline-none focus:border-accent"
          dir="auto"
          value={formulaValue}
          placeholder={t('sheet.formulaHint')}
          onFocus={() => editing === null && store.getState().startEdit()}
          onChange={(e) => store.getState().updateEdit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              store.getState().commitEdit('down')
              gridRef.current?.focus()
            } else if (e.key === 'Escape') {
              store.getState().cancelEdit()
              gridRef.current?.focus()
            }
          }}
          list="nova-sheet-functions"
        />
        <datalist id="nova-sheet-functions">{FUNCTION_NAMES.map((f) => <option key={f} value={`=${f}(`} />)}</datalist>
      </div>

      {/* الشبكة */}
      <div className="relative min-h-0 flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">{t('common.loading')}</div>
        ) : (
          <Grid
            ref={gridRef}
            store={store}
            sheet={sheet}
            anchor={anchor}
            focus={focus}
            editing={editing}
            locale={i18n.language}
            currency={currency}
            rtl={rtl}
            onContextMenu={(x, y, col, row) => setMenu({ x, y, col, row })}
          />
        )}
        {menu && (
          <div className="fixed z-50 w-56 overflow-hidden rounded-md border border-border bg-surface py-1 text-xs shadow-pop" style={{ left: Math.min(menu.x, window.innerWidth - 240), top: Math.min(menu.y, window.innerHeight - 340) }} onClick={(e) => e.stopPropagation()}>
            {menuItems.map((m) =>
              m.key.startsWith('sep') ? <div key={m.key} className="my-1 h-px bg-border" /> : (
                <button key={m.key} className={clsx('block w-full px-3 py-1.5 text-start hover:bg-surface-2', m.danger && 'text-danger')} onClick={() => { m.run?.(); setMenu(null) }}>{t(`sheet.${m.key}`)}</button>
              )
            )}
          </div>
        )}
      </div>

      {/* الأوراق + شريط الحالة */}
      <div className="flex items-center gap-1 border-t border-border bg-surface px-2 py-1 text-xs">
        {wb.sheets.map((s, i) => (
          <div key={s.id} className={clsx('group flex items-center gap-1 rounded-md border px-2.5 py-1', i === wb.activeSheet ? 'border-accent bg-accent/10 font-medium text-accent' : 'border-transparent text-muted hover:bg-surface-2')}
            onClick={() => store.getState().setActiveSheet(i)}
            onDoubleClick={() => {
              const name = window.prompt(t('sheet.renameSheet'), s.name)
              if (name) store.getState().renameSheet(i, name)
            }}>
            <span>{s.name}</span>
            {wb.sheets.length > 1 && (
              <button className="hidden rounded p-0.5 hover:bg-danger/10 hover:text-danger group-hover:block" title={t('sheet.deleteSheet')} onClick={(e) => { e.stopPropagation(); if (window.confirm(t('sheet.deleteSheet') + ` "${s.name}"?`)) store.getState().deleteSheet(i) }}><X className="h-3 w-3" /></button>
            )}
          </div>
        ))}
        <Button size="icon" variant="ghost" className="h-6 w-6" title={t('sheet.addSheet')} onClick={() => store.getState().addSheet()}><Plus className="h-3.5 w-3.5" /></Button>
        <div className="ms-auto flex items-center gap-4 text-muted">
          {stats.cells > 1 && <span>{t('sheet.selected', { count: stats.cells })}</span>}
          {stats.count > 0 && (
            <>
              <span>{t('sheet.sum')}: <b className="ltr-text text-fg">{nf.format(stats.sum)}</b></span>
              <span>{t('sheet.avg')}: <b className="ltr-text text-fg">{nf.format(stats.avg ?? 0)}</b></span>
              <span>{t('sheet.count')}: <b className="ltr-text text-fg">{stats.count}</b></span>
            </>
          )}
          <span>{t('sheet.gridInfo', { rows: sheet.rowCount, cols: sheet.colCount })}</span>
        </div>
      </div>

      <InvoiceMappingDialog open={mapOpen} onClose={() => setMapOpen(false)} sheet={sheet} decimals={decimals} defaultTax={defaultTax} onConfirm={(r) => createInvoice(r.items)} />
    </div>
  )
}

function ToggleBtn({ active, title, onClick, children }: { active: boolean; title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick} className={clsx('inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors', active ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg')}>
      {children}
    </button>
  )
}

// ------------------------------------------------------------------ الشبكة الافتراضية
import { forwardRef, useImperativeHandle } from 'react'

interface GridProps {
  store: StoreApi<WorkbookState>
  sheet: Sheet
  anchor: { col: number; row: number }
  focus: { col: number; row: number }
  editing: string | null
  locale: string
  currency: string
  rtl: boolean
  onContextMenu: (x: number, y: number, col: number, row: number) => void
}

const Grid = forwardRef<HTMLDivElement, GridProps>(function Grid({ store, sheet, anchor, focus, editing, locale, currency, rtl, onContextMenu }, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => containerRef.current as HTMLDivElement)
  const [scroll, setScroll] = useState({ left: 0, top: 0, w: 800, h: 600 })
  const [resize, setResize] = useState<{ col: number; startX: number; startW: number; w: number } | null>(null)
  const dragging = useRef(false)

  const colX = useMemo(() => {
    const out = [0]
    for (let c = 0; c < sheet.colCount; c++) out.push(out[c] + (resize?.col === c ? resize.w : sheet.colWidths[c] ?? DEFAULT_COL_WIDTH))
    return out
  }, [sheet.colCount, sheet.colWidths, resize])
  const rowY = useMemo(() => {
    const out = [0]
    for (let r = 0; r < sheet.rowCount; r++) out.push(out[r] + (sheet.rowHeights[r] ?? DEFAULT_ROW_HEIGHT))
    return out
  }, [sheet.rowCount, sheet.rowHeights])
  const totalW = colX[colX.length - 1]
  const totalH = rowY[rowY.length - 1]

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => requestAnimationFrame(() => setScroll((s) => ({ ...s, w: el.clientWidth, h: el.clientHeight }))))
    ro.observe(el)
    setScroll((s) => ({ ...s, w: el.clientWidth, h: el.clientHeight }))
    return () => ro.disconnect()
  }, [])

  const findIndex = (prefix: number[], pos: number) => {
    let lo = 0
    let hi = prefix.length - 2
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (prefix[mid] <= pos) lo = mid
      else hi = mid - 1
    }
    return lo
  }
  const c0 = Math.max(0, findIndex(colX, scroll.left) - 1)
  const c1 = Math.min(sheet.colCount - 1, findIndex(colX, scroll.left + scroll.w) + 1)
  const r0 = Math.max(0, findIndex(rowY, scroll.top) - 1)
  const r1 = Math.min(sheet.rowCount - 1, findIndex(rowY, scroll.top + scroll.h) + 2)

  const sel: Range = expandToMerges(sheet, selRange(anchor, focus))
  const covered = useMemo(() => {
    const set = new Map<string, { col: number; row: number }>()
    for (const m of sheet.merges) for (let r = m.row; r < m.row + m.rows; r++) for (let c = m.col; c < m.col + m.cols; c++) if (r !== m.row || c !== m.col) set.set(`${c}:${r}`, { col: m.col, row: m.row })
    return set
  }, [sheet.merges])
  const mergeAt = (c: number, r: number) => sheet.merges.find((m) => m.col === c && m.row === r)

  // إبقاء الخلية النشطة ظاهرة
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const x0 = colX[anchor.col] ?? 0
    const x1 = colX[anchor.col + 1] ?? x0 + DEFAULT_COL_WIDTH
    const y0 = rowY[anchor.row] ?? 0
    const y1 = rowY[anchor.row + 1] ?? y0 + DEFAULT_ROW_HEIGHT
    const viewW = el.clientWidth - HEADER_W
    const viewH = el.clientHeight - HEADER_H
    const left = Math.abs(el.scrollLeft)
    let nextLeft = left
    let nextTop = el.scrollTop
    if (x0 < left) nextLeft = x0
    else if (x1 > left + viewW) nextLeft = x1 - viewW
    if (y0 < el.scrollTop) nextTop = y0
    else if (y1 > el.scrollTop + viewH) nextTop = y1 - viewH
    if (nextLeft !== left) el.scrollLeft = rtl ? -nextLeft : nextLeft
    if (nextTop !== el.scrollTop) el.scrollTop = nextTop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor.col, anchor.row])

  useEffect(() => {
    if (editing !== null) editorRef.current?.focus({ preventScroll: true })
    else containerRef.current?.focus({ preventScroll: true })
  }, [editing])

  const cellAt = (e: React.MouseEvent): { col: number; row: number } | null => {
    const el = containerRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const xIn = rtl ? rect.right - e.clientX : e.clientX - rect.left
    const yIn = e.clientY - rect.top
    if (xIn < HEADER_W || yIn < HEADER_H) return null
    const col = findIndex(colX, xIn - HEADER_W + Math.abs(el.scrollLeft))
    const row = findIndex(rowY, yIn - HEADER_H + el.scrollTop)
    const c = covered.get(`${col}:${row}`)
    return c ?? { col, row }
  }

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.dataset.resize) return
    const ref = cellAt(e)
    if (!ref) return
    if (editing !== null) store.getState().commitEdit('none')
    if (e.shiftKey) store.getState().select(store.getState().anchor, ref)
    else store.getState().select(ref)
    dragging.current = true
  }
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return
    const ref = cellAt(e)
    if (ref) store.getState().select(store.getState().anchor, ref)
  }
  const onMouseUp = () => {
    dragging.current = false
  }
  const onDoubleClick = (e: React.MouseEvent) => {
    if (cellAt(e)) store.getState().startEdit()
  }
  const onContext = (e: React.MouseEvent) => {
    e.preventDefault()
    const ref = cellAt(e)
    if (!ref) return
    const inSel = ref.col >= sel.c0 && ref.col <= sel.c1 && ref.row >= sel.r0 && ref.row <= sel.r1
    if (!inSel) store.getState().select(ref)
    onContextMenu(e.clientX, e.clientY, ref.col, ref.row)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing !== null) return
    const s = store.getState()
    const ctrl = e.ctrlKey || e.metaKey
    const k = e.key
    if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault()
      const horizontal = k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : 0
      const dc = rtl ? -horizontal : horizontal
      const dr = k === 'ArrowDown' ? 1 : k === 'ArrowUp' ? -1 : 0
      s.moveFocus(dc, dr, e.shiftKey)
      return
    }
    if (k === 'Enter') {
      e.preventDefault()
      s.moveFocus(0, e.shiftKey ? -1 : 1, false)
      return
    }
    if (k === 'Tab') {
      e.preventDefault()
      s.moveFocus(e.shiftKey ? -1 : 1, 0, false)
      return
    }
    if (k === 'Delete') {
      e.preventDefault()
      s.clearSelection()
      return
    }
    if (k === 'Backspace') {
      e.preventDefault()
      s.startEdit('')
      return
    }
    if (k === 'F2') {
      e.preventDefault()
      s.startEdit()
      return
    }
    if (k === 'Home') {
      e.preventDefault()
      s.select({ col: 0, row: ctrl ? 0 : s.anchor.row })
      return
    }
    if (ctrl) {
      const lower = k.toLowerCase()
      if (lower === 'c' || lower === 'x') {
        e.preventDefault()
        void navigator.clipboard.writeText(s.copy(lower === 'x'))
      } else if (lower === 'v') {
        e.preventDefault()
        void navigator.clipboard.readText().then((txt) => txt && store.getState().paste(txt))
      } else if (lower === 'z') {
        e.preventDefault()
        s.undo()
      } else if (lower === 'y') {
        e.preventDefault()
        s.redo()
      } else if (lower === 'b' || lower === 'i' || lower === 'u') {
        e.preventDefault()
        s.toggleStyle(lower === 'b' ? 'bold' : lower === 'i' ? 'italic' : 'underline')
      } else if (lower === 'a') {
        e.preventDefault()
        s.selectAll()
      }
      return
    }
    if (k.length === 1 && !e.altKey) {
      e.preventDefault()
      s.startEdit(k)
    }
  }

  // تغيير عرض الأعمدة بالسحب
  const startResize = (e: React.PointerEvent, col: number) => {
    e.preventDefault()
    e.stopPropagation()
    const startW = sheet.colWidths[col] ?? DEFAULT_COL_WIDTH
    const startX = e.clientX
    setResize({ col, startX, startW, w: startW })
    const move = (ev: PointerEvent) => {
      const delta = (ev.clientX - startX) * (rtl ? -1 : 1)
      setResize({ col, startX, startW, w: Math.max(28, startW + delta) })
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const delta = (ev.clientX - startX) * (rtl ? -1 : 1)
      setResize(null)
      store.getState().setColWidth(col, Math.max(28, startW + delta))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const cells: React.ReactNode[] = []
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const key = `${c}:${r}`
      if (covered.has(key)) continue
      const cell = sheet.cells[key]
      const m = mergeAt(c, r)
      const w = m ? (colX[Math.min(c + m.cols, colX.length - 1)] ?? totalW) - colX[c] : colX[c + 1] - colX[c]
      const h = m ? (rowY[Math.min(r + m.rows, rowY.length - 1)] ?? totalH) - rowY[r] : rowY[r + 1] - rowY[r]
      const selected = c >= sel.c0 && c <= sel.c1 && r >= sel.r0 && r <= sel.r1
      const active = c === anchor.col && r === anchor.row
      const cs = cell?.style
      const isNum = typeof cell?.value === 'number'
      const isErr = typeof cell?.value === 'string' && cell.value.startsWith('#') && isFormula(cell.input)
      const align = cs?.align ?? (isNum ? 'end' : 'start')
      if (!cell && !selected && !active) {
        cells.push(<div key={key} className="absolute border-b border-e border-border/60" style={{ insetInlineStart: colX[c], top: rowY[r], width: w, height: h }} />)
        continue
      }
      cells.push(
        <div
          key={key}
          className={clsx('absolute flex items-center overflow-hidden border-b border-e border-border/60 px-1.5 text-[12.5px] leading-none', selected && !active && 'bg-accent/10', active && 'z-10 ring-2 ring-inset ring-accent', isErr && 'text-danger', cs?.bold && 'font-semibold', cs?.italic && 'italic', cs?.underline && 'underline')}
          style={{
            insetInlineStart: colX[c], top: rowY[r], width: w, height: h,
            justifyContent: align === 'center' ? 'center' : align === 'end' ? 'flex-end' : 'flex-start',
            background: cs?.background && !selected ? cs.background : undefined,
            color: cs?.color || undefined,
            fontSize: cs?.fontSize ? `${cs.fontSize}px` : undefined
          }}
        >
          <span className={clsx('truncate', isNum && 'ltr-text tabular-nums')} dir={isNum ? 'ltr' : 'auto'}>{formatCellValue(cell, locale, currency)}</span>
        </div>
      )
    }
  }

  const editW = colX[anchor.col + 1] - colX[anchor.col]
  const editH = rowY[anchor.row + 1] - rowY[anchor.row]

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="relative h-full w-full select-none overflow-auto outline-none"
      onScroll={(e) => {
        const el = e.currentTarget
        setScroll((s) => ({ ...s, left: Math.abs(el.scrollLeft), top: el.scrollTop }))
      }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContext}
      onKeyDown={onKeyDown}
    >
      <div style={{ width: HEADER_W + totalW, height: HEADER_H + totalH, position: 'relative' }}>
        {/* رأس الأعمدة (ثابت عموديًا) */}
        <div className="sticky top-0 z-30 flex bg-surface-2" style={{ height: HEADER_H, width: HEADER_W + totalW }}>
          <div className="sticky start-0 z-40 shrink-0 border-b border-e border-border bg-surface-2" style={{ width: HEADER_W, height: HEADER_H }} />
          <div className="relative shrink-0" style={{ width: totalW, height: HEADER_H }}>
            {Array.from({ length: c1 - c0 + 1 }, (_, i) => c0 + i).map((c) => (
              <div key={c} className={clsx('absolute flex items-center justify-center border-b border-e border-border text-[11px] font-medium', c >= sel.c0 && c <= sel.c1 ? 'bg-accent/15 text-accent' : 'text-muted')}
                style={{ insetInlineStart: colX[c], top: 0, width: colX[c + 1] - colX[c], height: HEADER_H }}
                onMouseDown={(e) => {
                  if ((e.target as HTMLElement).dataset.resize) return
                  e.stopPropagation()
                  store.getState().select({ col: c, row: 0 }, { col: c, row: sheet.rowCount - 1 })
                }}>
                {colToLetters(c)}
                <div data-resize="1" className="absolute top-0 h-full w-[5px] cursor-col-resize hover:bg-accent/50" style={{ insetInlineEnd: -2 }} onPointerDown={(e) => startResize(e, c)} />
              </div>
            ))}
          </div>
        </div>
        {/* الصفوف */}
        <div className="flex" style={{ height: totalH, width: HEADER_W + totalW }}>
          <div className="sticky start-0 z-20 shrink-0 bg-surface-2" style={{ width: HEADER_W, height: totalH }}>
            <div className="relative" style={{ height: totalH }}>
              {Array.from({ length: r1 - r0 + 1 }, (_, i) => r0 + i).map((r) => (
                <div key={r} className={clsx('absolute flex w-full items-center justify-center border-b border-e border-border text-[11px] ltr-text', r >= sel.r0 && r <= sel.r1 ? 'bg-accent/15 text-accent' : 'text-muted')}
                  style={{ top: rowY[r], height: rowY[r + 1] - rowY[r] }}
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    store.getState().select({ col: 0, row: r }, { col: sheet.colCount - 1, row: r })
                  }}>
                  {r + 1}
                </div>
              ))}
            </div>
          </div>
          <div className="relative shrink-0 bg-surface" style={{ width: totalW, height: totalH }}>
            {cells}
            {editing !== null && (
              /* الغلاف بلا dir حتى تُحسب inset-inline-start باتجاه الشبكة، أما الإدخال فاتجاهه تلقائي حسب النص */
              <div className="absolute z-20" style={{ insetInlineStart: colX[anchor.col], top: rowY[anchor.row], width: Math.max(editW, 120), height: editH }}>
              <input
                ref={editorRef}
                className="h-full w-full border-2 border-accent bg-surface px-1.5 text-[12.5px] outline-none"
                dir="auto"
                value={editing}
                onChange={(e) => store.getState().updateEdit(e.target.value)}
                onBlur={() => {
                  // النقر على شريط الصيغة ينقل التركيز إليه؛ لا نلغي التحرير حينها
                  setTimeout(() => {
                    const ae = document.activeElement as HTMLElement | null
                    if (ae?.getAttribute('list') === 'nova-sheet-functions') return
                    if (store.getState().editing !== null && ae !== editorRef.current) store.getState().commitEdit('none')
                  }, 0)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    store.getState().commitEdit(e.shiftKey ? 'none' : 'down')
                  } else if (e.key === 'Tab') {
                    e.preventDefault()
                    store.getState().commitEdit('right')
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    store.getState().cancelEdit()
                  }
                  e.stopPropagation()
                }}
              />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})
