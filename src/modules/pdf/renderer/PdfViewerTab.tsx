/**
 * تبويب عارض PDF: شريط أدوات بأسلوب Acrobat، شريط جانبي (مصغرات/إشارات/بحث)، صفحات كسولة قابلة للتحديد،
 * تكبير وملاءمة ودوران وملء شاشة، كلمة سر، تنبيه المسح الضوئي، معلومات المستند، طباعة وتصدير.
 */
import { clsx } from 'clsx'
import {
  Bookmark, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Copy, Download, FileText, ImageDown, Info, LayoutList, Lock, Maximize2,
  Minimize2, Minus, MoveHorizontal, PanelLeftClose, PenLine, Plus, Printer, Receipt, RotateCcw, RotateCw, ScanText, Search, Square, X
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { StoreApi } from 'zustand'
import type { TabComponentProps } from '@renderer/app/tabRegistry'
import { baseName } from '@renderer/app/openFile'
import { Button, Dialog, EmptyState, Input, Kbd, Spinner } from '@renderer/components/ui'
import { fmtBytes, fmtDate } from '@renderer/lib/format'
import { invoke } from '@renderer/lib/ipc'
import { notify } from '@renderer/stores/notifications'
import { useSettings } from '@renderer/stores/settings'
import { useTabs } from '@renderer/stores/tabs'
import { applyEdits } from '../shared/applyEdits'
import { OcrDialog } from '@modules/ocr/renderer/OcrDialog'
import { EditToolbar } from './EditToolbar'
import type { OutlineItem } from './pdfEngine'
import { PdfPage } from './PdfPage'
import { exportFlattenedPdf, exportPagesAsImages, exportText, printDocument, renderPageToDataUrl } from './printPdf'
import { PropertiesPanel } from './PropertiesPanel'
import { rasterizeText } from './rasterizeText'
import { createEditorStore, type EditorState, useEditor } from './useEditor'
import { createViewerStore, CSS_PER_PT, PAGE_GAP, useViewer, type ViewerState } from './usePdfViewer'

const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

export function PdfViewerTab({ tab }: TabComponentProps) {
  const path = (tab.params.path as string | null) ?? null
  const initialBytes = tab.params.bytes as Uint8Array | undefined
  const initialName = (tab.params.name as string | undefined) ?? (path ? baseName(path) : 'document.pdf')
  const storeRef = useRef<StoreApi<ViewerState> | null>(null)
  if (!storeRef.current) storeRef.current = createViewerStore(path, initialName)
  const store = storeRef.current

  useEffect(() => {
    if (initialBytes) void store.getState().loadBytes(initialBytes, initialName, path)
    else void store.getState().load()
    return () => store.getState().destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store])

  const status = useViewer(store, (s) => s.status)
  if (status === 'loading' || status === 'idle') return <Centered><Spinner /></Centered>
  if (status === 'password') return <PasswordGate store={store} />
  if (status === 'error') return <ErrorState store={store} />
  return <Viewer store={store} tabId={tab.id} autoOcr={!!tab.params.ocr} />
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center bg-surface-2/40">{children}</div>
}

// ------------------------------------------------------------------ كلمة السر
function PasswordGate({ store }: { store: StoreApi<ViewerState> }) {
  const { t } = useTranslation()
  const [pw, setPw] = useState('')
  const error = useViewer(store, (s) => s.error)
  const fileName = useViewer(store, (s) => s.fileName)
  return (
    <Centered>
      <form className="card w-full max-w-sm p-6 text-center animate-scale-in" onSubmit={(e) => { e.preventDefault(); void store.getState().load(pw) }}>
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent"><Lock className="h-5 w-5" /></div>
        <h3 className="font-semibold">{t('pdf.password')}</h3>
        <p className="mt-1 text-xs text-muted">{fileName}</p>
        <p className="mt-2 text-[13px] text-muted">{t('pdf.passwordHint')}</p>
        <Input autoFocus type="password" value={pw} onChange={(e) => setPw(e.target.value)} className="mt-4 ltr-text" />
        {error?.messageKey === 'errors.pdf.wrong_password' && <p className="mt-2 text-xs text-danger">{t('errors.PDF_PASSWORD')}</p>}
        <Button type="submit" variant="primary" className="mt-4 w-full">{t('pdf.open')}</Button>
      </form>
    </Centered>
  )
}

function ErrorState({ store }: { store: StoreApi<ViewerState> }) {
  const { t } = useTranslation()
  const error = useViewer(store, (s) => s.error)
  return (
    <Centered>
      <EmptyState icon={<FileText className="h-6 w-6" />} title={t(error?.messageKey ?? 'errors.UNKNOWN', error?.params)} body={store.getState().path ?? ''} action={<Button onClick={() => void store.getState().load()}>{t('common.retry')}</Button>} />
    </Centered>
  )
}

// ------------------------------------------------------------------ العارض
function Viewer({ store, tabId, autoOcr = false }: { store: StoreApi<ViewerState>; tabId: string; autoOcr?: boolean }) {
  const { t } = useTranslation()
  const s = useViewer(store, (st) => st)
  const settings = useSettings((st) => st.settings)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const visibleRatios = useRef<Map<number, number>>(new Map())
  const [pageInput, setPageInput] = useState('1')
  const [infoOpen, setInfoOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const programmaticScroll = useRef(false)
  const openTab = useTabs((st) => st.open)
  const setTabDirty = useTabs((st) => st.setDirty)
  const [ocrOpen, setOcrOpen] = useState(autoOcr)
  useEffect(() => {
    if (autoOcr) setOcrOpen(true)
  }, [autoOcr])

  // ---- وضع التعديل ----
  const editorRef = useRef<StoreApi<EditorState> | null>(null)
  if (!editorRef.current) editorRef.current = createEditorStore()
  const editor = editorRef.current
  const editing = useEditor(editor, (e) => e.enabled)
  const editDirty = useEditor(editor, (e) => e.history.past.length > 0)
  useEffect(() => setTabDirty(tabId, editing && editDirty), [editing, editDirty, tabId, setTabDirty])

  const bakeEdits = async (): Promise<Uint8Array | null> => {
    if (!s.bytes) return null
    return applyEdits(s.bytes, editor.getState().layer(), { rasterizeText })
  }

  /** حفظ في الملف نفسه (أو نسخة جديدة) ثم إعادة تحميل العارض بالنتيجة. */
  const saveEdits = async (asCopy: boolean) => {
    if (!s.bytes) return
    if (editor.getState().layer().objects.length === 0) {
      notify.info('edit.noChanges')
      return
    }
    let target = s.path
    if (asCopy || !target) {
      target = await invoke('dialog:save-file', { defaultPath: s.fileName.replace(/\.pdf$/i, '') + (asCopy ? '-edited.pdf' : '.pdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }] })
      if (!target) return
    }
    setBusy('save')
    try {
      const out = await bakeEdits()
      if (!out) return
      await invoke('file:write', { path: target, data: out })
      await invoke('recent:add', { path: target, kind: 'pdf' })
      editor.getState().reset()
      editor.getState().setEnabled(false)
      await store.getState().loadBytes(out, baseName(target), target)
      notify.success(asCopy ? 'edit.savedAs' : 'edit.saved', { name: baseName(target) })
    } catch (e) {
      notify.error(e)
    } finally {
      setBusy(null)
    }
  }

  const exitEditing = () => {
    const st = editor.getState()
    if (st.layer().objects.length > 0 && !window.confirm(t('edit.confirmExit'))) return
    st.reset()
    st.setEnabled(false)
  }

  // Ctrl+Z / Ctrl+Y / Ctrl+S في وضع التعديل
  useEffect(() => {
    if (!editing) return
    const onKey = (e: KeyboardEvent) => {
      if (useTabs.getState().activeId !== tabId) return
      const target = e.target as HTMLElement
      if (target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT') return
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); editor.getState().undo() }
      else if (e.ctrlKey && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); editor.getState().redo() }
      else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); void saveEdits(false) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, tabId, s.bytes, s.path])

  // ملاءمة أولية بعد معرفة حجم الحاوية، وإعادة الملاءمة عند تغيير الحجم
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const apply = () => {
      const state = store.getState()
      if (state.zoomMode !== 'custom') state.setZoomMode(state.zoomMode, el.clientWidth, el.clientHeight)
    }
    apply()
    // نؤجّل إلى الإطار التالي حتى لا يُعاد التخطيط داخل رد نداء ResizeObserver نفسه
    let frame = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(apply)
    })
    ro.observe(el)
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
    }
  }, [store, s.sidebar, s.rotation])

  useEffect(() => setPageInput(String(s.currentPage + 1)), [s.currentPage])

  // تحديد الصفحة الحالية من الصفحات الأكثر ظهورًا
  const onVisible = useCallback((index: number, ratio: number) => {
    visibleRatios.current.set(index, ratio)
    if (programmaticScroll.current) return
    let best = -1
    let bestRatio = 0
    for (const [i, r] of visibleRatios.current) if (r > bestRatio) { best = i; bestRatio = r }
    if (best >= 0 && best !== store.getState().currentPage) store.setState({ currentPage: best })
  }, [store])

  const scrollToPage = useCallback((index: number) => {
    const el = scrollerRef.current?.querySelector<HTMLElement>(`[data-page="${index}"]`)
    if (!el) return
    programmaticScroll.current = true
    el.scrollIntoView({ block: 'start' })
    store.getState().setPage(index)
    window.setTimeout(() => (programmaticScroll.current = false), 400)
  }, [store])

  const goTo = (index: number) => scrollToPage(Math.max(0, Math.min(index, s.pages.length - 1)))

  // Ctrl+عجلة للتكبير داخل العارض فقط
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      store.getState().zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [store])

  // اختصارات خاصة بالعارض عند تركيز التبويب
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useTabs.getState().activeId !== tabId) return
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT'
      if (e.ctrlKey && (e.key === '=' || e.key === '+')) { e.preventDefault(); store.getState().zoomBy(1.2) }
      else if (e.ctrlKey && e.key === '-') { e.preventDefault(); store.getState().zoomBy(1 / 1.2) }
      else if (e.ctrlKey && e.key === '0') { e.preventDefault(); store.getState().setZoomMode('fit-width', scrollerRef.current?.clientWidth, scrollerRef.current?.clientHeight) }
      else if (e.ctrlKey && e.key.toLowerCase() === 'f') { e.preventDefault(); store.getState().setSidebar('search'); setTimeout(() => document.getElementById(`pdf-search-${tabId}`)?.focus(), 30) }
      else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); void saveAs() }
      else if (!typing && (e.key === 'PageDown' || e.key === 'ArrowRight' && document.dir === 'ltr' || e.key === 'ArrowLeft' && document.dir === 'rtl')) { e.preventDefault(); goTo(store.getState().currentPage + 1) }
      else if (!typing && (e.key === 'PageUp' || e.key === 'ArrowLeft' && document.dir === 'ltr' || e.key === 'ArrowRight' && document.dir === 'rtl')) { e.preventDefault(); goTo(store.getState().currentPage - 1) }
      else if (!typing && e.key === 'Home') { e.preventDefault(); goTo(0) }
      else if (!typing && e.key === 'End') { e.preventDefault(); goTo(store.getState().pages.length - 1) }
      else if (e.key === 'F11') { e.preventDefault(); store.getState().setFullscreen(!store.getState().fullscreen) }
      else if (e.key === 'Escape' && store.getState().fullscreen) store.getState().setFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, tabId])

  const doPrint = async () => {
    if (!s.engine) return
    setBusy('print')
    try {
      const result = await printDocument(s.engine, s.pages, s.fileName, { rotation: s.rotation, copies: settings.printing.copies })
      if (result.success) notify.success('pdf.printSent')
    } catch (e) {
      notify.error(e)
    } finally {
      setBusy(null)
    }
  }

  // Ctrl+P / أمر الطباعة العام: يُنفَّذ هنا فقط عندما يكون هذا التبويب هو النشط
  useEffect(() => {
    const onPrint = () => {
      if (useTabs.getState().activeId === tabId) void doPrint()
    }
    window.addEventListener('nova:print', onPrint)
    return () => window.removeEventListener('nova:print', onPrint)
  })

  const saveAs = async () => {
    if (!s.bytes) return
    const target = await invoke('dialog:save-file', { defaultPath: s.fileName, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
    if (!target) return
    try {
      await invoke('file:write', { path: target, data: s.bytes })
      await invoke('recent:add', { path: target, kind: 'pdf' })
      notify.success('pdf.exported', { name: baseName(target) })
    } catch (e) {
      notify.error(e)
    }
  }

  const exportPdfFlat = async () => {
    if (!s.engine) return
    const target = await invoke('dialog:save-file', { defaultPath: s.fileName.replace(/\.pdf$/i, '') + '-export.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] })
    if (!target) return
    setBusy('export')
    try {
      await exportFlattenedPdf(s.engine, s.pages, s.fileName, target, undefined, s.rotation)
      notify.success('pdf.exported', { name: baseName(target) })
    } catch (e) {
      notify.error(e)
    } finally {
      setBusy(null)
    }
  }

  const exportImages = async () => {
    if (!s.engine) return
    const folder = await invoke('dialog:pick-folder', {})
    if (!folder) return
    setBusy('images')
    try {
      const files = await exportPagesAsImages(s.engine, s.pages, folder, s.fileName.replace(/\.pdf$/i, ''))
      notify.success('tools.savedMany', { count: files.length })
    } catch (e) {
      notify.error(e)
    } finally {
      setBusy(null)
    }
  }

  const exportTxt = async () => {
    if (!s.engine) return
    const target = await invoke('dialog:save-file', { defaultPath: s.fileName.replace(/\.pdf$/i, '') + '.txt', filters: [{ name: 'Text', extensions: ['txt'] }] })
    if (!target) return
    try {
      await exportText(s.engine, s.pages, target)
      notify.success('pdf.exported', { name: baseName(target) })
    } catch (e) {
      notify.error(e)
    }
  }

  const copyPageText = async () => {
    if (!s.engine) return
    await navigator.clipboard.writeText(await s.engine.pageText(s.currentPage))
    notify.success('pdf.copied')
  }

  const zoomPercent = Math.round((s.scale / CSS_PER_PT) * 100)
  const activeHit = s.search.current >= 0 ? s.search.hits[s.search.current] : null

  return (
    <div className={clsx('flex h-full flex-col bg-surface-2/40', s.fullscreen && 'fixed inset-0 z-40 bg-bg')}>
      {/* شريط الأدوات */}
      <div className="flex h-11 items-center gap-1 border-b border-border bg-surface px-2">
        <IconBtn title={t('pdf.thumbnails')} active={s.sidebar !== 'none'} onClick={() => s.setSidebar(s.sidebar === 'none' ? 'thumbnails' : 'none')}><PanelLeftClose className="h-4 w-4 rtl:-scale-x-100" /></IconBtn>
        <Sep />
        <IconBtn title={t('pdf.prevPage')} disabled={s.currentPage === 0} onClick={() => goTo(s.currentPage - 1)}><ChevronUp className="h-4 w-4" /></IconBtn>
        <form className="flex items-center gap-1 text-[12.5px]" onSubmit={(e) => { e.preventDefault(); const n = Number(pageInput); if (n >= 1) goTo(n - 1) }}>
          <input value={pageInput} onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))} className="input h-7 w-12 px-1 text-center numeric" aria-label={t('pdf.goToPage')} />
          <span className="text-muted">/ {s.pages.length}</span>
        </form>
        <IconBtn title={t('pdf.nextPage')} disabled={s.currentPage >= s.pages.length - 1} onClick={() => goTo(s.currentPage + 1)}><ChevronDown className="h-4 w-4" /></IconBtn>
        <Sep />
        <IconBtn title={t('pdf.zoomOut')} onClick={() => s.zoomBy(1 / 1.2)}><Minus className="h-4 w-4" /></IconBtn>
        <select value={s.zoomMode === 'custom' ? String(zoomPercent) : s.zoomMode} onChange={(e) => {
          const v = e.target.value
          const el = scrollerRef.current
          if (v === 'fit-width' || v === 'fit-page') s.setZoomMode(v, el?.clientWidth, el?.clientHeight)
          else s.setScale((Number(v) / 100) * CSS_PER_PT)
        }} className="input h-7 w-[118px] px-1 text-[12px]">
          <option value="fit-width">{t('pdf.fitWidth')}</option>
          <option value="fit-page">{t('pdf.fitPage')}</option>
          {!ZOOM_PRESETS.some((z) => Math.round(z * 100) === zoomPercent) && s.zoomMode === 'custom' && <option value={String(zoomPercent)}>{zoomPercent}%</option>}
          {ZOOM_PRESETS.map((z) => <option key={z} value={String(Math.round(z * 100))}>{Math.round(z * 100)}%</option>)}
        </select>
        <IconBtn title={t('pdf.zoomIn')} onClick={() => s.zoomBy(1.2)}><Plus className="h-4 w-4" /></IconBtn>
        <IconBtn title={t('pdf.fitWidth')} active={s.zoomMode === 'fit-width'} onClick={() => s.setZoomMode('fit-width', scrollerRef.current?.clientWidth, scrollerRef.current?.clientHeight)}><MoveHorizontal className="h-4 w-4" /></IconBtn>
        <IconBtn title={t('pdf.fitPage')} active={s.zoomMode === 'fit-page'} onClick={() => s.setZoomMode('fit-page', scrollerRef.current?.clientWidth, scrollerRef.current?.clientHeight)}><Square className="h-4 w-4" /></IconBtn>
        <Sep />
        <IconBtn title={t('pdf.rotateLeft')} onClick={() => s.rotate(-90)}><RotateCcw className="h-4 w-4" /></IconBtn>
        <IconBtn title={t('pdf.rotateRight')} onClick={() => s.rotate(90)}><RotateCw className="h-4 w-4" /></IconBtn>
        <Sep />
        <IconBtn title={t('pdf.search')} active={s.sidebar === 'search'} onClick={() => { s.setSidebar('search'); setTimeout(() => document.getElementById(`pdf-search-${tabId}`)?.focus(), 30) }}><Search className="h-4 w-4" /></IconBtn>
        <IconBtn title={t('pdf.selectAllText')} onClick={() => void copyPageText()}><Copy className="h-4 w-4" /></IconBtn>
        <IconBtn title={t('pdf.info')} onClick={() => setInfoOpen(true)}><Info className="h-4 w-4" /></IconBtn>
        <IconBtn title={t('ocr.run')} onClick={() => setOcrOpen(true)}><ScanText className="h-4 w-4" /></IconBtn>

        <div className="ms-auto flex items-center gap-1">
          {!editing && (
            <Button size="sm" variant="primary" icon={<PenLine className="h-3.5 w-3.5" />} onClick={() => { s.resetRotation(); editor.getState().setEnabled(true) }}>{t('edit.enter')}</Button>
          )}
          <Button size="sm" variant="ghost" icon={<Receipt className="h-3.5 w-3.5" />} onClick={() => openTab({ id: s.path ? `import:${s.path}` : undefined, kind: 'pdf-import', title: 't:imp.title', params: { path: s.path, bytes: s.path ? undefined : s.bytes, name: s.fileName } })}>{t('pdf.convertToInvoice')}</Button>
          <Button size="sm" variant="ghost" icon={<Printer className="h-3.5 w-3.5" />} loading={busy === 'print'} onClick={() => void doPrint()}>{t('pdf.print')}</Button>
          <Menu label={t('pdf.export')} icon={<Download className="h-3.5 w-3.5" />} busy={busy === 'export' || busy === 'images'} items={[
            { label: t('pdf.saveAs'), icon: <Download className="h-3.5 w-3.5" />, onClick: saveAs },
            { label: `${t('pdf.export')} PDF`, icon: <FileText className="h-3.5 w-3.5" />, onClick: exportPdfFlat },
            { label: t('pdf.exportImages'), icon: <ImageDown className="h-3.5 w-3.5" />, onClick: exportImages },
            { label: t('pdf.exportText'), icon: <FileText className="h-3.5 w-3.5" />, onClick: exportTxt }
          ]} />
          <IconBtn title={s.fullscreen ? t('pdf.exitFullscreen') : t('pdf.fullscreen')} onClick={() => s.setFullscreen(!s.fullscreen)}>{s.fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</IconBtn>
        </div>
      </div>

      {/* تنبيه المسح الضوئي */}
      {s.isScanned && !s.scannedNoticeDismissed && settings.ocr.autoPrompt && (
        <div className="flex items-center gap-3 border-b border-warning/30 bg-warning/10 px-4 py-2 text-[13px]">
          <ScanText className="h-4 w-4 text-warning" />
          <span className="flex-1">{t('pdf.scannedNotice')}</span>
          <Button size="sm" variant="primary" onClick={() => setOcrOpen(true)}>{t('pdf.runOcr')}</Button>
          <Button size="sm" variant="ghost" onClick={() => s.dismissScannedNotice()}>{t('pdf.later')}</Button>
        </div>
      )}

      {editing && <EditToolbar store={editor} saving={busy === 'save'} onSave={() => void saveEdits(false)} onSaveAs={() => void saveEdits(true)} onExit={exitEditing} />}

      <div className="flex min-h-0 flex-1">
        {/* الشريط الجانبي */}
        {s.sidebar !== 'none' && (
          <aside className="flex w-60 shrink-0 flex-col border-e border-border bg-surface">
            <div className="flex border-b border-border">
              {(['thumbnails', 'bookmarks', 'search'] as const).map((mode) => (
                <button key={mode} type="button" onClick={() => s.setSidebar(mode)} className={clsx('flex flex-1 items-center justify-center gap-1 py-2 text-[11.5px]', s.sidebar === mode ? 'border-b-2 border-accent text-accent' : 'text-muted hover:text-fg')} title={t(`pdf.${mode}`)}>
                  {mode === 'thumbnails' ? <LayoutList className="h-3.5 w-3.5" /> : mode === 'bookmarks' ? <Bookmark className="h-3.5 w-3.5" /> : <Search className="h-3.5 w-3.5" />}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {s.sidebar === 'thumbnails' && <Thumbnails store={store} onSelect={goTo} />}
              {s.sidebar === 'bookmarks' && <Bookmarks items={s.outline} onSelect={goTo} />}
              {s.sidebar === 'search' && <SearchPanel store={store} tabId={tabId} onSelect={goTo} />}
            </div>
          </aside>
        )}

        {/* الصفحات */}
        <div ref={scrollerRef} className="min-w-0 flex-1 overflow-auto" style={{ direction: 'ltr' }}>
          <div className="flex flex-col items-center" style={{ gap: PAGE_GAP, padding: PAGE_GAP }}>
            {s.engine && s.pages.map((page) => (
              <PdfPage key={page.index} engine={s.engine!} page={page} scale={s.scale} rotation={s.rotation} hits={s.search.hits} activeHit={activeHit} onVisible={onVisible} editor={editor} editing={editing} textVersion={s.ocrVersion} />
            ))}
          </div>
        </div>

        {/* لوحة الخصائص في وضع التعديل */}
        {editing && <PropertiesPanel store={editor} />}
      </div>

      <OcrDialog open={ocrOpen} onClose={() => setOcrOpen(false)} store={store} autoStart={autoOcr} />

      {/* شريط الحالة */}
      <div className="flex h-7 items-center gap-4 border-t border-border bg-surface px-3 text-[11.5px] text-muted">
        <span className="truncate ltr-text">{s.path ?? s.fileName}</span>
        <span className="ms-auto">{t('pdf.pages', { count: s.pages.length })}</span>
        <span className="ltr-text">{zoomPercent}%</span>
        {s.bytes && <span>{fmtBytes(s.bytes.byteLength)}</span>}
      </div>

      <Dialog open={infoOpen} onClose={() => setInfoOpen(false)} title={t('pdf.info')} width="max-w-md">
        <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-[13px]">
          {[
            ['title', s.metadata.Title], ['author', s.metadata.Author], ['subject', s.metadata.Subject], ['creator', s.metadata.Creator],
            ['producer', s.metadata.Producer], ['created', pdfDate(s.metadata.CreationDate)], ['modified', pdfDate(s.metadata.ModDate)],
            ['pages', String(s.pages.length)], ['size', fmtBytes(s.bytes?.byteLength)], ['path', s.path ?? '']
          ].map(([k, v]) => (
            <FragmentRow key={k} label={t(`pdf.properties.${k}`)} value={v || '—'} />
          ))}
        </dl>
      </Dialog>
    </div>
  )
}

function FragmentRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="break-all ltr-text">{value}</dd>
    </>
  )
}

function pdfDate(raw?: string): string {
  if (!raw) return ''
  const m = raw.match(/D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?/)
  if (!m) return raw
  return fmtDate(`${m[1]}-${m[2]}-${m[3]}T${m[4] ?? '00'}:${m[5] ?? '00'}:00`, true)
}

function IconBtn({ children, title, onClick, active, disabled }: { children: React.ReactNode; title: string; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick}
      className={clsx('flex h-8 w-8 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40', active && 'bg-accent/10 text-accent')}>
      {children}
    </button>
  )
}

function Sep() {
  return <span className="mx-1 h-5 w-px bg-border" />
}

function Menu({ label, icon, items, busy }: { label: string; icon: React.ReactNode; items: { label: string; icon: React.ReactNode; onClick: () => void | Promise<void> }[]; busy?: boolean }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [open])
  return (
    <div className="relative">
      <Button size="sm" variant="ghost" icon={icon} loading={busy} onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}>{label}<ChevronDown className="h-3 w-3" /></Button>
      {open && (
        <ul className="card absolute end-0 top-full z-30 mt-1 min-w-[200px] py-1 text-[13px] shadow-pop animate-scale-in">
          {items.map((item) => (
            <li key={item.label}>
              <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-start hover:bg-surface-2" onClick={() => { setOpen(false); void item.onClick() }}>{item.icon}{item.label}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ المصغرات
function Thumbnails({ store, onSelect }: { store: StoreApi<ViewerState>; onSelect: (i: number) => void }) {
  const engine = useViewer(store, (s) => s.engine)
  const pages = useViewer(store, (s) => s.pages)
  const current = useViewer(store, (s) => s.currentPage)
  const rotation = useViewer(store, (s) => s.rotation)
  return (
    <div className="grid gap-3 p-3">
      {pages.map((page) => (
        <Thumb key={page.index} index={page.index} active={page.index === current} onClick={() => onSelect(page.index)} render={(cb) => engine ? renderPageToDataUrl(engine, page.index, 36, rotation).then(cb).catch(() => undefined) : undefined} />
      ))}
    </div>
  )
}

function Thumb({ index, active, onClick, render }: { index: number; active: boolean; onClick: () => void; render: (cb: (url: string) => void) => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !src) {
        render((url) => setSrc(url))
        obs.disconnect()
      }
    }, { rootMargin: '300px 0px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [render, src])
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [active])
  return (
    <button ref={ref} type="button" onClick={onClick} className={clsx('group rounded-md border-2 p-1 transition-colors', active ? 'border-accent' : 'border-transparent hover:border-border')}>
      <div className="flex min-h-[120px] items-center justify-center overflow-hidden rounded bg-white shadow-soft">
        {src ? <img src={src} alt="" className="max-w-full" /> : <Spinner className="h-4 w-4" />}
      </div>
      <div className={clsx('mt-1 text-center text-[11px]', active ? 'text-accent' : 'text-muted')}>{index + 1}</div>
    </button>
  )
}

// ------------------------------------------------------------------ الإشارات المرجعية
function Bookmarks({ items, onSelect }: { items: OutlineItem[]; onSelect: (i: number) => void }) {
  const { t } = useTranslation()
  if (!items.length) return <p className="p-4 text-center text-xs text-muted">{t('pdf.noBookmarks')}</p>
  return <ul className="p-2 text-[12.5px]"><OutlineList items={items} depth={0} onSelect={onSelect} /></ul>
}

function OutlineList({ items, depth, onSelect }: { items: OutlineItem[]; depth: number; onSelect: (i: number) => void }) {
  const [open, setOpen] = useState<Record<number, boolean>>({})
  return (
    <>
      {items.map((item, i) => (
        <li key={i}>
          <div className="flex items-center" style={{ paddingInlineStart: depth * 12 }}>
            {item.children.length > 0 ? (
              <button type="button" className="p-0.5 text-muted" onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))}>
                {open[i] ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3 rtl:-scale-x-100" />}
              </button>
            ) : <span className="w-4" />}
            <button type="button" disabled={item.page === null} onClick={() => item.page !== null && onSelect(item.page)} className="flex-1 truncate rounded px-1.5 py-1 text-start hover:bg-surface-2 disabled:opacity-50">{item.title}</button>
            {item.page !== null && <span className="text-[10.5px] text-muted">{item.page + 1}</span>}
          </div>
          {open[i] && item.children.length > 0 && <ul><OutlineList items={item.children} depth={depth + 1} onSelect={onSelect} /></ul>}
        </li>
      ))}
    </>
  )
}

// ------------------------------------------------------------------ البحث
function SearchPanel({ store, tabId, onSelect }: { store: StoreApi<ViewerState>; tabId: string; onSelect: (i: number) => void }) {
  const { t } = useTranslation()
  const search = useViewer(store, (s) => s.search)
  const [q, setQ] = useState(search.query)
  const grouped = useMemo(() => {
    const map = new Map<number, number[]>()
    search.hits.forEach((h, i) => map.set(h.page, [...(map.get(h.page) ?? []), i]))
    return [...map.entries()]
  }, [search.hits])
  return (
    <div className="flex h-full flex-col">
      <form className="flex gap-1 border-b border-border p-2" onSubmit={(e) => { e.preventDefault(); void store.getState().runSearch(q) }}>
        <Input id={`pdf-search-${tabId}`} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('pdf.searchPlaceholder')} className="h-8" />
        {q && <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setQ(''); store.getState().clearSearch() }}><X className="h-3.5 w-3.5" /></Button>}
      </form>
      <div className="flex items-center gap-1 px-2 py-1.5 text-[11.5px] text-muted">
        <span className="flex-1">{search.running ? `${Math.round(search.progress * 100)}%` : search.query ? (search.hits.length ? t('pdf.results', { count: search.hits.length }) : t('pdf.noResults')) : ''}</span>
        <Button size="icon" variant="ghost" className="h-6 w-6" disabled={!search.hits.length} onClick={() => store.getState().stepSearch(-1)} title={t('pdf.prevResult')}><ChevronLeft className="h-3.5 w-3.5 rtl:-scale-x-100" /></Button>
        <Button size="icon" variant="ghost" className="h-6 w-6" disabled={!search.hits.length} onClick={() => store.getState().stepSearch(1)} title={t('pdf.nextResult')}><ChevronRight className="h-3.5 w-3.5 rtl:-scale-x-100" /></Button>
        <Kbd>F3</Kbd>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 text-[12px]">
        {grouped.map(([page, indices]) => (
          <li key={page} className="mb-1">
            <div className="px-1 py-1 text-[11px] font-medium text-muted">{t('pdf.page')} {page + 1}</div>
            {indices.map((i) => (
              <button key={i} type="button" onClick={() => { store.setState((s) => ({ search: { ...s.search, current: i } })); onSelect(page) }} className={clsx('block w-full truncate rounded px-2 py-1 text-start hover:bg-surface-2', i === search.current && 'bg-accent/10 text-accent')}>
                {search.hits[i].snippet}
              </button>
            ))}
          </li>
        ))}
      </ul>
    </div>
  )
}
